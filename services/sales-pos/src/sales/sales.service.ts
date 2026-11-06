import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../events/outbox.service';
import { DOMAIN_EVENTS } from '../events/domain-events.constant';
import { ProductInventoryClientService } from '../product-inventory-client/product-inventory-client.service';
import { CatalogService } from '../catalog/catalog.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { assertBranchAccess, assertTenantAccess } from '../common/utils/tenant-scope.util';
import { CheckoutDto } from './dto/checkout.dto';
import { RefundDto } from './dto/refund.dto';

const ROUNDING_TOLERANCE = 0.01;
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
    private readonly productInventoryClient: ProductInventoryClientService,
    private readonly catalogService: CatalogService,
  ) {}

  async checkout(caller: AuthenticatedUser, dto: CheckoutDto, bearerToken: string) {
    assertBranchAccess(caller, dto.branchId);
    const tenantId = caller.tenantId!;

    const existing = await this.prisma.sale.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey } },
      include: { lines: true, payments: true },
    });
    if (existing) {
      return existing;
    }

    const shiftId = await this.resolveShiftId(caller, dto.branchId, dto.shiftId);

    // Price is always re-resolved live against Product & Inventory - the
    // catalog cache is a lookup convenience only, never the source of truth
    // for money.
    const resolvedLines = await Promise.all(
      dto.lines.map(async (line) => {
        const price = await this.productInventoryClient.resolvePrice(
          bearerToken,
          line.variantId,
          dto.branchId,
        );
        const lineDiscount = line.lineDiscount ?? 0;
        const lineTotal = Number(price.amount) * line.quantity - lineDiscount;
        const productName = await this.catalogService.getNameByVariantId(tenantId, line.variantId);
        return {
          ...line,
          unitPrice: price.amount,
          currency: price.currency,
          lineDiscount,
          lineTotal,
          productName: productName ?? line.variantId,
        };
      }),
    );

    const subtotal = resolvedLines.reduce((sum, l) => sum + Number(l.unitPrice) * l.quantity, 0);
    const lineDiscounts = resolvedLines.reduce((sum, l) => sum + l.lineDiscount, 0);
    const discountTotal = (dto.discountTotal ?? 0) + lineDiscounts;
    const taxTotal = dto.taxTotal ?? 0;
    const totalAmount = subtotal - discountTotal + taxTotal;

    const paymentsTotal = dto.payments.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(paymentsTotal - totalAmount) > ROUNDING_TOLERANCE) {
      throw new BadRequestException(
        `Payment total (${paymentsTotal}) does not match sale total (${totalAmount})`,
      );
    }

    // Deducted against Product & Inventory's own idempotency guard, keyed
    // off the client's checkout idempotency key, so a retried checkout call
    // that already decremented stock on a previous attempt is a safe no-op
    // here rather than a double deduction.
    for (const line of resolvedLines) {
      await this.productInventoryClient.stockOut(
        bearerToken,
        line.variantId,
        dto.branchId,
        line.quantity,
        `${dto.idempotencyKey}:${line.variantId}`,
        'POS sale',
      );
    }

    const currency = resolvedLines[0]?.currency ?? 'PKR';
    const paymentMethod =
      new Set(dto.payments.map((p) => p.method)).size === 1 ? dto.payments[0].method : 'SPLIT';

    try {
      return await this.prisma.$transaction(async (tx) => {
        const sale = await tx.sale.create({
          data: {
            tenantId,
            branchId: dto.branchId,
            cashierId: caller.userId,
            shiftId,
            subtotal,
            discountTotal,
            taxTotal,
            totalAmount,
            currency,
            idempotencyKey: dto.idempotencyKey,
            lines: {
              create: resolvedLines.map((l) => ({
                variantId: l.variantId,
                productNameSnapshot: l.productName,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                lineDiscount: l.lineDiscount,
                lineTotal: l.lineTotal,
              })),
            },
            payments: {
              create: dto.payments.map((p) => ({
                method: p.method,
                amount: p.amount,
                reference: p.reference,
              })),
            },
          },
          include: { lines: true, payments: true },
        });

        await this.outboxService.enqueue(tx, {
          tenantId,
          eventType: DOMAIN_EVENTS.SALE_COMPLETED,
          payload: {
            saleId: sale.id,
            branchId: sale.branchId,
            cashierId: sale.cashierId,
            totalAmount: sale.totalAmount.toString(),
            currency: sale.currency,
            paymentMethod,
            lines: resolvedLines.map((l) => ({
              variantId: l.variantId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
            })),
          },
        });

        return sale;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        const winner = await this.prisma.sale.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey } },
          include: { lines: true, payments: true },
        });
        if (winner) {
          return winner;
        }
      }
      throw error;
    }
  }

  async refund(caller: AuthenticatedUser, saleId: string, dto: RefundDto, bearerToken: string) {
    const sale = await this.loadOwnedSale(caller, saleId);

    const existing = await this.prisma.refund.findUnique({
      where: {
        tenantId_idempotencyKey: { tenantId: sale.tenantId, idempotencyKey: dto.idempotencyKey },
      },
    });
    if (existing) {
      return existing;
    }

    return this.processRefund(caller, sale, dto, bearerToken, 'refund');
  }

  async void(
    caller: AuthenticatedUser,
    saleId: string,
    idempotencyKey: string,
    bearerToken: string,
    reason?: string,
  ) {
    const sale = await this.loadOwnedSale(caller, saleId);
    if (sale.status !== 'COMPLETED') {
      throw new ConflictException('Only a sale with no prior refunds can be voided');
    }

    const existing = await this.prisma.refund.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: sale.tenantId, idempotencyKey } },
    });
    if (existing) {
      return existing;
    }

    const lines = sale.lines.map((l) => ({ saleLineId: l.id, quantity: l.quantity }));
    return this.processRefund(caller, sale, { idempotencyKey, lines, reason }, bearerToken, 'void');
  }

  private async processRefund(
    caller: AuthenticatedUser,
    sale: Prisma.SaleGetPayload<{ include: { lines: true } }>,
    dto: RefundDto,
    bearerToken: string,
    kind: 'refund' | 'void',
  ) {
    if (sale.status === 'REFUNDED' || sale.status === 'VOIDED') {
      throw new ConflictException(`Sale is already ${sale.status.toLowerCase()}`);
    }

    const linesById = new Map(sale.lines.map((l) => [l.id, l]));
    let refundAmount = 0;
    const resolvedLines = dto.lines.map((requested) => {
      const saleLine = linesById.get(requested.saleLineId);
      if (!saleLine) {
        throw new BadRequestException(
          `Sale line ${requested.saleLineId} does not belong to this sale`,
        );
      }
      const remaining = saleLine.quantity - saleLine.refundedQuantity;
      if (requested.quantity > remaining) {
        throw new BadRequestException(
          `Cannot refund ${requested.quantity} of line ${saleLine.id}, only ${remaining} remaining`,
        );
      }
      const unitNet = Number(saleLine.lineTotal) / saleLine.quantity;
      const amount = unitNet * requested.quantity;
      refundAmount += amount;
      return { saleLine, quantity: requested.quantity, amount };
    });

    // Restock before the local transaction - Product & Inventory's own
    // idempotency guard (keyed off this refund's idempotencyKey) makes a
    // retried refund call safe even if stock was already restored on a
    // previous attempt.
    for (const line of resolvedLines) {
      await this.productInventoryClient.stockIn(
        bearerToken,
        line.saleLine.variantId,
        sale.branchId,
        line.quantity,
        `${dto.idempotencyKey}:${line.saleLine.id}`,
        kind === 'void' ? 'POS sale void' : 'POS refund',
      );
    }

    const shiftId = await this.resolveShiftId(caller, sale.branchId, undefined);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const refund = await tx.refund.create({
          data: {
            saleId: sale.id,
            tenantId: sale.tenantId,
            branchId: sale.branchId,
            amount: refundAmount,
            reason: dto.reason,
            processedByUserId: caller.userId,
            shiftId,
            idempotencyKey: dto.idempotencyKey,
            lines: {
              create: resolvedLines.map((l) => ({
                saleLineId: l.saleLine.id,
                quantity: l.quantity,
                amount: l.amount,
              })),
            },
          },
        });

        for (const line of resolvedLines) {
          await tx.saleLine.update({
            where: { id: line.saleLine.id },
            data: { refundedQuantity: { increment: line.quantity } },
          });
        }

        const updatedLines = await tx.saleLine.findMany({ where: { saleId: sale.id } });
        const fullyRefunded = updatedLines.every((l) => l.refundedQuantity >= l.quantity);
        const newStatus =
          kind === 'void' ? 'VOIDED' : fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

        await tx.sale.update({
          where: { id: sale.id },
          data: {
            status: newStatus,
            refundedAmount: { increment: refundAmount },
            refundedAt: new Date(),
          },
        });

        await this.outboxService.enqueue(tx, {
          tenantId: sale.tenantId,
          eventType: DOMAIN_EVENTS.SALE_REFUNDED,
          payload: { saleId: sale.id, refundAmount: refundAmount.toFixed(2) },
        });

        return refund;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        const winner = await this.prisma.refund.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId: sale.tenantId,
              idempotencyKey: dto.idempotencyKey,
            },
          },
        });
        if (winner) {
          return winner;
        }
      }
      throw error;
    }
  }

  async findOne(caller: AuthenticatedUser, saleId: string) {
    return this.loadOwnedSale(caller, saleId);
  }

  private async loadOwnedSale(caller: AuthenticatedUser, saleId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { lines: true, payments: true, refunds: true },
    });
    if (!sale) {
      throw new NotFoundException();
    }
    assertTenantAccess(caller, sale.tenantId);
    assertBranchAccess(caller, sale.branchId);
    return sale;
  }

  private async resolveShiftId(
    caller: AuthenticatedUser,
    branchId: string,
    explicitShiftId: string | undefined,
  ): Promise<string | null> {
    if (explicitShiftId) {
      const shift = await this.prisma.shift.findUnique({ where: { id: explicitShiftId } });
      if (!shift || shift.tenantId !== caller.tenantId || shift.status !== 'OPEN') {
        throw new BadRequestException('shiftId does not refer to an open shift you can access');
      }
      return shift.id;
    }
    const current = await this.prisma.shift.findFirst({
      where: { tenantId: caller.tenantId!, branchId, cashierId: caller.userId, status: 'OPEN' },
    });
    return current?.id ?? null;
  }
}
