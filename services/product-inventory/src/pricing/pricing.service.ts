import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PriceModel } from '../generated/prisma/models';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../events/outbox.service';
import { DOMAIN_EVENTS } from '../events/domain-events.constant';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { assertTenantAccess, resolveTenantScope } from '../common/utils/tenant-scope.util';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { CreatePriceDto } from './dto/create-price.dto';
import { UpdatePriceDto } from './dto/update-price.dto';
import { ListPricesQueryDto } from './dto/list-prices-query.dto';
import { ResolvePriceQueryDto } from './dto/resolve-price-query.dto';

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

  async create(caller: AuthenticatedUser, dto: CreatePriceDto) {
    if (!dto.productId === !dto.variantId) {
      throw new BadRequestException('Exactly one of productId or variantId must be provided');
    }

    const tenantId = await this.resolveOwningTenant(dto.productId, dto.variantId);
    assertTenantAccess(caller, tenantId);

    return this.prisma.$transaction(async (tx) => {
      const price = await tx.price.create({
        data: {
          tenantId,
          productId: dto.productId,
          variantId: dto.variantId,
          branchId: dto.branchId,
          amount: dto.amount,
          currency: dto.currency ?? 'PKR',
          effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
        },
      });

      await this.recordHistory(tx, price, 'created', caller.userId);
      await this.outboxService.enqueue(tx, {
        tenantId,
        eventType: DOMAIN_EVENTS.PRICE_UPDATED,
        payload: {
          priceId: price.id,
          productId: price.productId,
          variantId: price.variantId,
          branchId: price.branchId,
          amount: price.amount.toString(),
          currency: price.currency,
        },
      });

      return price;
    });
  }

  async findAll(
    caller: AuthenticatedUser,
    query: ListPricesQueryDto,
  ): Promise<PaginatedResultDto<unknown>> {
    const tenantId = resolveTenantScope(caller, query.tenantId ?? null);

    const where = {
      ...(tenantId === null ? {} : { tenantId }),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.price.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { effectiveFrom: 'desc' },
      }),
      this.prisma.price.count({ where }),
    ]);

    return new PaginatedResultDto(data, total, query.page, query.limit);
  }

  async findOne(caller: AuthenticatedUser, id: string) {
    const price = await this.prisma.price.findUnique({ where: { id } });
    if (!price) {
      throw new NotFoundException();
    }
    assertTenantAccess(caller, price.tenantId);
    return price;
  }

  async update(caller: AuthenticatedUser, id: string, dto: UpdatePriceDto) {
    const existing = await this.findOne(caller, id);

    return this.prisma.$transaction(async (tx) => {
      const price = await tx.price.update({
        where: { id },
        data: {
          ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
          ...(dto.effectiveFrom ? { effectiveFrom: new Date(dto.effectiveFrom) } : {}),
          ...(dto.effectiveTo ? { effectiveTo: new Date(dto.effectiveTo) } : {}),
        },
      });

      await this.recordHistory(tx, price, 'updated', caller.userId);
      await this.outboxService.enqueue(tx, {
        tenantId: existing.tenantId,
        eventType: DOMAIN_EVENTS.PRICE_UPDATED,
        payload: {
          priceId: price.id,
          productId: price.productId,
          variantId: price.variantId,
          branchId: price.branchId,
          amount: price.amount.toString(),
          currency: price.currency,
        },
      });

      return price;
    });
  }

  async getHistory(caller: AuthenticatedUser, id: string) {
    await this.findOne(caller, id);
    return this.prisma.priceHistory.findMany({
      where: { priceId: id },
      orderBy: { changedAt: 'desc' },
    });
  }

  /**
   * Resolves the single currently-effective price for a product/variant.
   * A branch-specific price (matching the given branchId) takes precedence
   * over the tenant-wide default (branchId null) when both are current.
   */
  async resolveCurrentPrice(caller: AuthenticatedUser, query: ResolvePriceQueryDto) {
    if (!query.productId === !query.variantId) {
      throw new BadRequestException('Exactly one of productId or variantId must be provided');
    }

    const tenantId = await this.resolveOwningTenant(query.productId, query.variantId);
    assertTenantAccess(caller, tenantId);

    const at = query.at ? new Date(query.at) : new Date();
    const baseWhere = {
      tenantId,
      ...(query.productId ? { productId: query.productId } : { variantId: query.variantId }),
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    };

    const branchPrice = query.branchId
      ? await this.prisma.price.findFirst({
          where: { ...baseWhere, branchId: query.branchId },
          orderBy: { effectiveFrom: 'desc' },
        })
      : null;
    if (branchPrice) {
      return branchPrice;
    }

    const tenantWidePrice = await this.prisma.price.findFirst({
      where: { ...baseWhere, branchId: null },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!tenantWidePrice) {
      throw new NotFoundException('No effective price found for this scope');
    }
    return tenantWidePrice;
  }

  private async resolveOwningTenant(
    productId: string | undefined,
    variantId: string | undefined,
  ): Promise<string> {
    if (productId) {
      const product = await this.prisma.product.findUnique({ where: { id: productId } });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
      return product.tenantId;
    }
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }
    return variant.tenantId;
  }

  private async recordHistory(
    tx: Prisma.TransactionClient,
    price: PriceModel,
    action: 'created' | 'updated',
    changedByUserId: string,
  ): Promise<void> {
    await tx.priceHistory.create({
      data: {
        priceId: price.id,
        tenantId: price.tenantId,
        productId: price.productId,
        variantId: price.variantId,
        branchId: price.branchId,
        amount: price.amount,
        currency: price.currency,
        effectiveFrom: price.effectiveFrom,
        effectiveTo: price.effectiveTo,
        action,
        changedByUserId,
      },
    });
  }
}
