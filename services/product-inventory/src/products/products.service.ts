import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { OutboxService } from '../events/outbox.service';
import { DOMAIN_EVENTS } from '../events/domain-events.constant';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { assertTenantAccess, resolveTenantScope } from '../common/utils/tenant-scope.util';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { AddProductImageDto } from './dto/add-product-image.dto';

const PRODUCT_INCLUDE = {
  brand: true,
  category: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

  async create(caller: AuthenticatedUser, dto: CreateProductDto) {
    const tenantId = resolveTenantScope(caller, dto.tenantId ?? null);
    if (tenantId === null) {
      throw new BadRequestException('tenantId is required to create a product');
    }

    await this.assertBrandAndCategoryBelongToTenant(tenantId, dto.brandId, dto.categoryId);

    const existing = await this.prisma.product.findFirst({
      where: { tenantId, articleNumber: dto.articleNumber },
    });
    if (existing) {
      throw new ConflictException(
        'A product with this article number already exists in this tenant',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          tenantId,
          articleNumber: dto.articleNumber,
          name: dto.name,
          description: dto.description,
          brandId: dto.brandId,
          categoryId: dto.categoryId,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        },
        include: PRODUCT_INCLUDE,
      });

      await this.outboxService.enqueue(tx, {
        tenantId,
        eventType: DOMAIN_EVENTS.PRODUCT_CREATED,
        payload: {
          productId: product.id,
          articleNumber: product.articleNumber,
          name: product.name,
        },
      });

      return product;
    });
  }

  async findAll(
    caller: AuthenticatedUser,
    query: ListProductsQueryDto,
  ): Promise<PaginatedResultDto<unknown>> {
    const tenantId = resolveTenantScope(caller, query.tenantId ?? null);

    const where = {
      ...(tenantId === null ? {} : { tenantId }),
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { articleNumber: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return new PaginatedResultDto(data, total, query.page, query.limit);
  }

  async findOne(caller: AuthenticatedUser, id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });
    if (!product) {
      throw new NotFoundException();
    }
    assertTenantAccess(caller, product.tenantId);
    return product;
  }

  async update(caller: AuthenticatedUser, id: string, dto: UpdateProductDto) {
    const product = await this.findOne(caller, id);
    await this.assertBrandAndCategoryBelongToTenant(product.tenantId, dto.brandId, dto.categoryId);

    if (dto.articleNumber) {
      const existing = await this.prisma.product.findFirst({
        where: { tenantId: product.tenantId, articleNumber: dto.articleNumber, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException(
          'A product with this article number already exists in this tenant',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: { ...dto, metadata: dto.metadata as Prisma.InputJsonValue | undefined },
        include: PRODUCT_INCLUDE,
      });

      await this.outboxService.enqueue(tx, {
        tenantId: product.tenantId,
        eventType: DOMAIN_EVENTS.PRODUCT_UPDATED,
        payload: { productId: updated.id, changes: dto },
      });

      return updated;
    });
  }

  async setActive(caller: AuthenticatedUser, id: string, isActive: boolean) {
    await this.findOne(caller, id);
    return this.prisma.product.update({
      where: { id },
      data: { isActive },
      include: PRODUCT_INCLUDE,
    });
  }

  async addImage(caller: AuthenticatedUser, productId: string, dto: AddProductImageDto) {
    await this.findOne(caller, productId);
    return this.prisma.productImage.create({
      data: { productId, url: dto.url, sortOrder: dto.sortOrder ?? 0 },
    });
  }

  async removeImage(caller: AuthenticatedUser, productId: string, imageId: string): Promise<void> {
    await this.findOne(caller, productId);
    await this.prisma.productImage.deleteMany({ where: { id: imageId, productId } });
  }

  private async assertBrandAndCategoryBelongToTenant(
    tenantId: string,
    brandId: string | undefined,
    categoryId: string | undefined,
  ): Promise<void> {
    if (brandId) {
      const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand || brand.tenantId !== tenantId) {
        throw new BadRequestException('Brand does not belong to this tenant');
      }
    }
    if (categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
      if (!category || category.tenantId !== tenantId) {
        throw new BadRequestException('Category does not belong to this tenant');
      }
    }
  }
}
