import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { StockMovementType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../events/outbox.service';
import { DOMAIN_EVENTS } from '../events/domain-events.constant';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { assertBranchAccess, assertTenantAccess } from '../common/utils/tenant-scope.util';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { RecordMovementDto } from './dto/record-movement.dto';
import { RecordAdjustmentDto } from './dto/record-adjustment.dto';
import { ListBalancesQueryDto } from './dto/list-balances-query.dto';
import { ListLedgerQueryDto } from './dto/list-ledger-query.dto';
import { SetThresholdDto } from './dto/set-threshold.dto';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

  async stockIn(caller: AuthenticatedUser, dto: RecordMovementDto) {
    return this.applyMovement(
      caller,
      dto.variantId,
      dto.branchId,
      'STOCK_IN',
      dto.quantity,
      dto.reference,
      dto.idempotencyKey,
    );
  }

  async stockOut(caller: AuthenticatedUser, dto: RecordMovementDto) {
    return this.applyMovement(
      caller,
      dto.variantId,
      dto.branchId,
      'STOCK_OUT',
      -dto.quantity,
      dto.reference,
      dto.idempotencyKey,
    );
  }

  async markDamaged(caller: AuthenticatedUser, dto: RecordMovementDto) {
    return this.applyMovement(
      caller,
      dto.variantId,
      dto.branchId,
      'DAMAGE',
      -dto.quantity,
      dto.reference,
      dto.idempotencyKey,
    );
  }

  async adjust(caller: AuthenticatedUser, dto: RecordAdjustmentDto) {
    return this.applyMovement(
      caller,
      dto.variantId,
      dto.branchId,
      'ADJUSTMENT',
      dto.quantityDelta,
      dto.reference,
      dto.idempotencyKey,
    );
  }

  async listBalances(
    caller: AuthenticatedUser,
    query: ListBalancesQueryDto,
  ): Promise<PaginatedResultDto<unknown>> {
    const tenantId = this.requireTenant(caller);
    if (query.branchId) {
      assertBranchAccess(caller, query.branchId);
    }

    const location = query.branchId
      ? await this.prisma.stockLocation.findUnique({
          where: { tenantId_branchId: { tenantId, branchId: query.branchId } },
        })
      : null;

    const where = {
      tenantId,
      ...(location ? { locationId: location.id } : {}),
      ...(query.variantId ? { variantId: query.variantId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockBalance.findMany({ where, skip: query.skip, take: query.limit }),
      this.prisma.stockBalance.count({ where }),
    ]);

    const withAvailable = data
      .map((b) => ({ ...b, availableQty: b.onHandQty - b.reservedQty }))
      .filter(
        (b) =>
          !query.lowStockOnly ||
          (b.lowStockThreshold !== null && b.onHandQty <= b.lowStockThreshold),
      );

    return new PaginatedResultDto(withAvailable, total, query.page, query.limit);
  }

  async listLedger(
    caller: AuthenticatedUser,
    query: ListLedgerQueryDto,
  ): Promise<PaginatedResultDto<unknown>> {
    const tenantId = this.requireTenant(caller);
    if (query.branchId) {
      assertBranchAccess(caller, query.branchId);
    }

    const location = query.branchId
      ? await this.prisma.stockLocation.findUnique({
          where: { tenantId_branchId: { tenantId, branchId: query.branchId } },
        })
      : null;

    const where = {
      tenantId,
      ...(location ? { locationId: location.id } : {}),
      ...(query.variantId ? { variantId: query.variantId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return new PaginatedResultDto(data, total, query.page, query.limit);
  }

  async setThreshold(caller: AuthenticatedUser, dto: SetThresholdDto) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: dto.variantId } });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }
    assertTenantAccess(caller, variant.tenantId);
    assertBranchAccess(caller, dto.branchId);

    const location = await this.getOrCreateLocation(variant.tenantId, dto.branchId);

    return this.prisma.stockBalance.upsert({
      where: { locationId_variantId: { locationId: location.id, variantId: dto.variantId } },
      create: {
        tenantId: variant.tenantId,
        locationId: location.id,
        variantId: dto.variantId,
        lowStockThreshold: dto.lowStockThreshold,
      },
      update: { lowStockThreshold: dto.lowStockThreshold },
    });
  }

  private requireTenant(caller: AuthenticatedUser): string {
    if (caller.tenantId === null) {
      throw new BadRequestException('A tenant context is required for inventory operations');
    }
    return caller.tenantId;
  }

  private async getOrCreateLocation(tenantId: string, branchId: string) {
    return this.prisma.stockLocation.upsert({
      where: { tenantId_branchId: { tenantId, branchId } },
      create: { tenantId, branchId },
      update: {},
    });
  }

  private async applyMovement(
    caller: AuthenticatedUser,
    variantId: string,
    branchId: string,
    type: StockMovementType,
    delta: number,
    reference: string | undefined,
    idempotencyKey: string,
  ) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }
    assertTenantAccess(caller, variant.tenantId);
    assertBranchAccess(caller, branchId);
    const tenantId = variant.tenantId;

    const existing = await this.prisma.stockMovement.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    });
    if (existing) {
      return existing;
    }

    const location = await this.getOrCreateLocation(tenantId, branchId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.stockBalance.upsert({
          where: { locationId_variantId: { locationId: location.id, variantId } },
          create: { tenantId, locationId: location.id, variantId },
          update: {},
        });

        // Single atomic conditional UPDATE: the non-negative check and the
        // mutation happen in one statement, so two concurrent requests can
        // never both read a stale balance and both "succeed" into a negative
        // on-hand quantity - Postgres serializes row-level writes for us.
        const rows = await tx.$queryRaw<{ onHandQty: number }[]>`
          UPDATE "stock_balances"
          SET "onHandQty" = "onHandQty" + ${delta}, "updatedAt" = now()
          WHERE "locationId" = ${location.id}::uuid
            AND "variantId" = ${variantId}::uuid
            AND "onHandQty" + ${delta} >= 0
          RETURNING "onHandQty"
        `;

        if (rows.length === 0) {
          throw new BadRequestException('Insufficient stock for this operation');
        }

        const movement = await tx.stockMovement.create({
          data: {
            tenantId,
            locationId: location.id,
            variantId,
            type,
            quantityDelta: delta,
            balanceAfter: rows[0].onHandQty,
            reference,
            idempotencyKey,
            createdByUserId: caller.userId,
          },
        });

        if (type === 'STOCK_IN') {
          await this.outboxService.enqueue(tx, {
            tenantId,
            eventType: DOMAIN_EVENTS.STOCK_RECEIVED,
            payload: {
              movementId: movement.id,
              variantId,
              branchId,
              quantity: delta,
              balanceAfter: movement.balanceAfter,
            },
          });
        } else if (type === 'ADJUSTMENT' || type === 'DAMAGE') {
          await this.outboxService.enqueue(tx, {
            tenantId,
            eventType: DOMAIN_EVENTS.STOCK_ADJUSTED,
            payload: {
              movementId: movement.id,
              variantId,
              branchId,
              type,
              quantityDelta: delta,
              balanceAfter: movement.balanceAfter,
            },
          });
        }

        return movement;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        // Lost the race to a concurrent identical request - return its result.
        const winner = await this.prisma.stockMovement.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
        });
        if (winner) {
          return winner;
        }
      }
      throw error;
    }
  }
}
