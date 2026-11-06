import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { assertTenantAccess } from '../common/utils/tenant-scope.util';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { AddBarcodeDto } from './dto/add-barcode.dto';

const VARIANT_INCLUDE = { barcodes: true };

function buildSku(articleNumber: string, size: string, color: string): string {
  return `${articleNumber}-${size}-${color}`.toUpperCase().replace(/\s+/g, '-');
}

@Injectable()
export class VariantsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOwningProduct(caller: AuthenticatedUser, productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    assertTenantAccess(caller, product.tenantId);
    return product;
  }

  async create(caller: AuthenticatedUser, productId: string, dto: CreateVariantDto) {
    const product = await this.getOwningProduct(caller, productId);

    const duplicateCombo = await this.prisma.productVariant.findFirst({
      where: { productId, size: dto.size, color: dto.color },
    });
    if (duplicateCombo) {
      throw new ConflictException(
        'A variant with this size and color already exists for this product',
      );
    }

    const sku = dto.sku ?? buildSku(product.articleNumber, dto.size, dto.color);
    const duplicateSku = await this.prisma.productVariant.findFirst({
      where: { tenantId: product.tenantId, sku },
    });
    if (duplicateSku) {
      throw new ConflictException('A variant with this SKU already exists in this tenant');
    }

    return this.prisma.productVariant.create({
      data: { tenantId: product.tenantId, productId, size: dto.size, color: dto.color, sku },
      include: VARIANT_INCLUDE,
    });
  }

  async findAllForProduct(
    caller: AuthenticatedUser,
    productId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResultDto<unknown>> {
    await this.getOwningProduct(caller, productId);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.productVariant.findMany({
        where: { productId },
        include: VARIANT_INCLUDE,
        skip: query.skip,
        take: query.limit,
        orderBy: [{ size: 'asc' }, { color: 'asc' }],
      }),
      this.prisma.productVariant.count({ where: { productId } }),
    ]);

    return new PaginatedResultDto(data, total, query.page, query.limit);
  }

  async findOne(caller: AuthenticatedUser, id: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
      include: VARIANT_INCLUDE,
    });
    if (!variant) {
      throw new NotFoundException();
    }
    assertTenantAccess(caller, variant.tenantId);
    return variant;
  }

  async update(caller: AuthenticatedUser, id: string, dto: UpdateVariantDto) {
    const variant = await this.findOne(caller, id);

    if (dto.size || dto.color) {
      const size = dto.size ?? variant.size;
      const color = dto.color ?? variant.color;
      const duplicateCombo = await this.prisma.productVariant.findFirst({
        where: { productId: variant.productId, size, color, id: { not: id } },
      });
      if (duplicateCombo) {
        throw new ConflictException(
          'A variant with this size and color already exists for this product',
        );
      }
    }

    if (dto.sku) {
      const duplicateSku = await this.prisma.productVariant.findFirst({
        where: { tenantId: variant.tenantId, sku: dto.sku, id: { not: id } },
      });
      if (duplicateSku) {
        throw new ConflictException('A variant with this SKU already exists in this tenant');
      }
    }

    return this.prisma.productVariant.update({
      where: { id },
      data: dto,
      include: VARIANT_INCLUDE,
    });
  }

  async setActive(caller: AuthenticatedUser, id: string, isActive: boolean) {
    await this.findOne(caller, id);
    return this.prisma.productVariant.update({
      where: { id },
      data: { isActive },
      include: VARIANT_INCLUDE,
    });
  }

  async addBarcode(caller: AuthenticatedUser, variantId: string, dto: AddBarcodeDto) {
    await this.findOne(caller, variantId);

    const existing = await this.prisma.barcode.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException('This barcode is already assigned to a variant');
    }

    return this.prisma.barcode.create({ data: { variantId, code: dto.code } });
  }

  async removeBarcode(
    caller: AuthenticatedUser,
    variantId: string,
    barcodeId: string,
  ): Promise<void> {
    await this.findOne(caller, variantId);
    await this.prisma.barcode.deleteMany({ where: { id: barcodeId, variantId } });
  }
}
