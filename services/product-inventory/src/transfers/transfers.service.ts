import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { OutboxService } from '../events/outbox.service';
import { DOMAIN_EVENTS } from '../events/domain-events.constant';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { assertTenantAccess } from '../common/utils/tenant-scope.util';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { ReasonDto } from './dto/reason.dto';
import { TransferLineQuantitiesDto } from './dto/transfer-line-quantities.dto';
import { ListTransfersQueryDto } from './dto/list-transfers-query.dto';

const TRANSFER_INCLUDE = { lines: true };

function generateReferenceNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = randomBytes(3).toString('hex').toUpperCase();
  return `IBT-${datePart}-${randomPart}`;
}

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly outboxService: OutboxService,
  ) {}

  private requireTenant(caller: AuthenticatedUser): string {
    if (caller.tenantId === null) {
      throw new BadRequestException('A tenant context is required for inter-branch transfers');
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

  /** A transfer touches two branches; a branch-restricted caller only needs to be party to one of them. */
  private assertEitherBranchAccess(
    caller: AuthenticatedUser,
    branchA: string,
    branchB: string,
  ): void {
    if (
      caller.branchIds.length > 0 &&
      !caller.branchIds.includes(branchA) &&
      !caller.branchIds.includes(branchB)
    ) {
      throw new NotFoundException();
    }
  }

  async create(caller: AuthenticatedUser, dto: CreateTransferDto) {
    const tenantId = this.requireTenant(caller);
    if (dto.sourceBranchId === dto.destinationBranchId) {
      throw new BadRequestException('Source and destination branches must differ');
    }
    this.assertEitherBranchAccess(caller, dto.sourceBranchId, dto.destinationBranchId);

    for (const line of dto.lines) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: line.variantId },
      });
      if (!variant || variant.tenantId !== tenantId) {
        throw new BadRequestException('Variant does not belong to this tenant');
      }
    }

    return this.prisma.stockTransfer.create({
      data: {
        tenantId,
        referenceNumber: generateReferenceNumber(),
        sourceBranchId: dto.sourceBranchId,
        destinationBranchId: dto.destinationBranchId,
        notes: dto.notes,
        lines: {
          create: dto.lines.map((l) => ({ variantId: l.variantId, requestedQty: l.requestedQty })),
        },
      },
      include: TRANSFER_INCLUDE,
    });
  }

  async findAll(
    caller: AuthenticatedUser,
    query: ListTransfersQueryDto,
  ): Promise<PaginatedResultDto<unknown>> {
    const tenantId = this.requireTenant(caller);
    const where = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.branchId
        ? { OR: [{ sourceBranchId: query.branchId }, { destinationBranchId: query.branchId }] }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockTransfer.findMany({
        where,
        include: TRANSFER_INCLUDE,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);

    return new PaginatedResultDto(data, total, query.page, query.limit);
  }

  async findOne(caller: AuthenticatedUser, id: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: TRANSFER_INCLUDE,
    });
    if (!transfer) {
      throw new NotFoundException();
    }
    assertTenantAccess(caller, transfer.tenantId);
    this.assertEitherBranchAccess(caller, transfer.sourceBranchId, transfer.destinationBranchId);
    return transfer;
  }

  async request(caller: AuthenticatedUser, id: string) {
    const transfer = await this.findOne(caller, id);
    this.assertStatus(transfer.status, ['DRAFT']);

    return this.prisma.stockTransfer.update({
      where: { id },
      data: { status: 'REQUESTED', requestedByUserId: caller.userId, requestedAt: new Date() },
      include: TRANSFER_INCLUDE,
    });
  }

  /**
   * Atomically claims a status transition before any stock-affecting work
   * runs, so two concurrent calls on the same transfer can never both pass a
   * stale in-memory status check and both apply their side effects - only
   * one UPDATE can match the WHERE clause; the loser gets 0 affected rows
   * and fails immediately, before touching any balance or reservation.
   */
  /**
   * Atomically claims a status transition as the FIRST statement of the
   * given transaction, so two concurrent calls on the same transfer can
   * never both pass a stale in-memory status check and both apply their
   * side effects - only one UPDATE can match the WHERE clause; the loser
   * gets 0 affected rows and fails immediately, and because this runs inside
   * the same transaction as the stock-affecting work that follows, a later
   * failure (e.g. insufficient stock) rolls the claimed status back too.
   */
  private async claimTransition(
    tx: Prisma.TransactionClient,
    id: string,
    fromStatus: string,
    toStatus: string,
  ): Promise<void> {
    const claimed = await tx.$executeRaw`
      UPDATE "stock_transfers"
      SET status = ${toStatus}::"StockTransferStatus", "updatedAt" = now()
      WHERE id = ${id}::uuid AND status = ${fromStatus}::"StockTransferStatus"
    `;
    if (claimed === 0) {
      throw new BadRequestException(
        `Transfer is not in ${fromStatus} status, or is being processed concurrently`,
      );
    }
  }

  /** Reserves the requested quantity at the source branch for every line. All-or-nothing: if any line lacks availability, the whole approval fails. */
  async approve(caller: AuthenticatedUser, id: string) {
    const transfer = await this.findOne(caller, id);
    this.assertStatus(transfer.status, ['REQUESTED']);

    const location = await this.getOrCreateLocation(transfer.tenantId, transfer.sourceBranchId);

    await this.prisma.$transaction(async (tx) => {
      await this.claimTransition(tx, id, 'REQUESTED', 'APPROVED');

      for (const line of transfer.lines) {
        await tx.stockBalance.upsert({
          where: { locationId_variantId: { locationId: location.id, variantId: line.variantId } },
          create: {
            tenantId: transfer.tenantId,
            locationId: location.id,
            variantId: line.variantId,
          },
          update: {},
        });

        const rows = await tx.$queryRaw<{ reservedQty: number }[]>`
          UPDATE "stock_balances"
          SET "reservedQty" = "reservedQty" + ${line.requestedQty}, "updatedAt" = now()
          WHERE "locationId" = ${location.id}::uuid
            AND "variantId" = ${line.variantId}::uuid
            AND "onHandQty" - "reservedQty" >= ${line.requestedQty}
          RETURNING "reservedQty"
        `;

        if (rows.length === 0) {
          throw new BadRequestException(
            `Insufficient available stock at the source branch for variant ${line.variantId}`,
          );
        }

        await tx.inventoryReservation.create({
          data: {
            tenantId: transfer.tenantId,
            transferId: transfer.id,
            locationId: location.id,
            variantId: line.variantId,
            quantity: line.requestedQty,
          },
        });
      }

      await tx.stockTransfer.update({
        where: { id },
        data: { approvedByUserId: caller.userId, approvedAt: new Date() },
      });
    });

    return this.findOne(caller, id);
  }

  async reject(caller: AuthenticatedUser, id: string, dto: ReasonDto) {
    const transfer = await this.findOne(caller, id);
    this.assertStatus(transfer.status, ['REQUESTED']);

    return this.prisma.stockTransfer.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectedByUserId: caller.userId,
        rejectedAt: new Date(),
        notes: dto.reason
          ? `${transfer.notes ?? ''}\nRejected: ${dto.reason}`.trim()
          : transfer.notes,
      },
      include: TRANSFER_INCLUDE,
    });
  }

  /** Only pre-dispatch: once stock has actually left the source branch, cancellation no longer makes sense. */
  async cancel(caller: AuthenticatedUser, id: string, dto: ReasonDto) {
    const transfer = await this.findOne(caller, id);
    this.assertStatus(transfer.status, ['DRAFT', 'REQUESTED', 'APPROVED']);

    await this.prisma.$transaction(async (tx) => {
      if (transfer.status === 'APPROVED') {
        const reservations = await tx.inventoryReservation.findMany({
          where: { transferId: id, status: 'ACTIVE' },
        });
        for (const reservation of reservations) {
          // Atomically claim this specific reservation before releasing its
          // balance - if dispatch() (or a concurrent cancel retry) already
          // consumed/released it, this UPDATE matches 0 rows and we skip,
          // rather than double-decrementing reservedQty.
          const { count } = await tx.inventoryReservation.updateMany({
            where: { id: reservation.id, status: 'ACTIVE' },
            data: { status: 'RELEASED' },
          });
          if (count > 0) {
            await tx.$executeRaw`
              UPDATE "stock_balances"
              SET "reservedQty" = "reservedQty" - ${reservation.quantity}, "updatedAt" = now()
              WHERE "locationId" = ${reservation.locationId}::uuid AND "variantId" = ${reservation.variantId}::uuid
            `;
          }
        }
      }

      await tx.stockTransfer.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledByUserId: caller.userId,
          cancelledAt: new Date(),
          notes: dto.reason
            ? `${transfer.notes ?? ''}\nCancelled: ${dto.reason}`.trim()
            : transfer.notes,
        },
      });
    });

    return this.findOne(caller, id);
  }

  /**
   * Consumes the reservation and decrements source on-hand stock. The
   * atomic claim below - not the earlier in-memory status check - is what
   * actually guarantees a transfer can never be dispatched twice: only one
   * concurrent caller can win the conditional UPDATE, and every caller that
   * loses it fails immediately, before touching any reservation or balance.
   */
  async dispatch(caller: AuthenticatedUser, id: string, dto: TransferLineQuantitiesDto) {
    const transfer = await this.findOne(caller, id);
    this.assertStatus(transfer.status, ['APPROVED']);

    await this.claimTransition(this.prisma, id, 'APPROVED', 'DISPATCHED');

    const overrides = new Map((dto.lines ?? []).map((l) => [l.lineId, l.quantity]));
    const location = await this.getOrCreateLocation(transfer.tenantId, transfer.sourceBranchId);

    for (const line of transfer.lines) {
      const dispatchedQty = overrides.get(line.id) ?? line.requestedQty;

      const reservation = await this.prisma.inventoryReservation.findFirst({
        where: { transferId: id, variantId: line.variantId, status: 'ACTIVE' },
      });

      await this.prisma.$transaction(async (tx) => {
        if (reservation) {
          await tx.$executeRaw`
            UPDATE "stock_balances"
            SET "reservedQty" = "reservedQty" - ${reservation.quantity}, "updatedAt" = now()
            WHERE "locationId" = ${location.id}::uuid AND "variantId" = ${line.variantId}::uuid
          `;
          await tx.inventoryReservation.update({
            where: { id: reservation.id },
            data: { status: 'CONSUMED' },
          });
        }
        await tx.stockTransferLine.update({ where: { id: line.id }, data: { dispatchedQty } });
      });

      if (dispatchedQty > 0) {
        await this.inventoryService.stockOut(caller, {
          variantId: line.variantId,
          branchId: transfer.sourceBranchId,
          quantity: dispatchedQty,
          reference: `Transfer ${transfer.referenceNumber} dispatch`,
          idempotencyKey: `transfer:${transfer.id}:dispatch:${line.id}`,
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: { dispatchedAt: new Date() },
        include: TRANSFER_INCLUDE,
      });

      await this.outboxService.enqueue(tx, {
        tenantId: transfer.tenantId,
        eventType: DOMAIN_EVENTS.STOCK_TRANSFERRED,
        payload: {
          transferId: transfer.id,
          referenceNumber: transfer.referenceNumber,
          sourceBranchId: transfer.sourceBranchId,
          destinationBranchId: transfer.destinationBranchId,
          lines: updated.lines.map((l) => ({
            variantId: l.variantId,
            dispatchedQty: l.dispatchedQty,
          })),
        },
      });

      return updated;
    });
  }

  async markInTransit(caller: AuthenticatedUser, id: string) {
    const transfer = await this.findOne(caller, id);
    this.assertStatus(transfer.status, ['DISPATCHED']);

    return this.prisma.stockTransfer.update({
      where: { id },
      data: { status: 'IN_TRANSIT', inTransitAt: new Date() },
      include: TRANSFER_INCLUDE,
    });
  }

  /** Supports partial receipt and quantity discrepancies: receivedQty need not match dispatchedQty. */
  async receive(caller: AuthenticatedUser, id: string, dto: TransferLineQuantitiesDto) {
    const transfer = await this.findOne(caller, id);
    this.assertStatus(transfer.status, ['IN_TRANSIT']);

    const overrides = new Map((dto.lines ?? []).map((l) => [l.lineId, l.quantity]));

    for (const line of transfer.lines) {
      const receivedQty = overrides.get(line.id) ?? line.dispatchedQty ?? 0;

      if (receivedQty > 0) {
        await this.inventoryService.stockIn(caller, {
          variantId: line.variantId,
          branchId: transfer.destinationBranchId,
          quantity: receivedQty,
          reference: `Transfer ${transfer.referenceNumber} receipt`,
          idempotencyKey: `transfer:${transfer.id}:receive:${line.id}`,
        });
      }

      await this.prisma.stockTransferLine.update({ where: { id: line.id }, data: { receivedQty } });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: { status: 'RECEIVED', receivedAt: new Date() },
        include: TRANSFER_INCLUDE,
      });

      await this.outboxService.enqueue(tx, {
        tenantId: transfer.tenantId,
        eventType: DOMAIN_EVENTS.STOCK_TRANSFER_RECEIVED,
        payload: {
          transferId: transfer.id,
          referenceNumber: transfer.referenceNumber,
          sourceBranchId: transfer.sourceBranchId,
          destinationBranchId: transfer.destinationBranchId,
          lines: updated.lines.map((l) => ({
            variantId: l.variantId,
            dispatchedQty: l.dispatchedQty,
            receivedQty: l.receivedQty,
          })),
        },
      });

      return updated;
    });
  }

  private assertStatus(current: string, allowed: string[]): void {
    if (!allowed.includes(current)) {
      throw new BadRequestException(
        `Transfer is in status ${current}; this action requires one of: ${allowed.join(', ')}`,
      );
    }
  }
}
