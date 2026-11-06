import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { assertBranchAccess, assertTenantAccess } from '../common/utils/tenant-scope.util';
import { OpenShiftDto } from './dto/open-shift.dto';
import { CloseShiftDto } from './dto/close-shift.dto';
import { RecordCashMovementDto } from './dto/cash-movement.dto';

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  async open(caller: AuthenticatedUser, dto: OpenShiftDto) {
    assertBranchAccess(caller, dto.branchId);
    const tenantId = caller.tenantId!;

    const existing = await this.prisma.shift.findFirst({
      where: { tenantId, cashierId: caller.userId, status: 'OPEN' },
    });
    if (existing) {
      throw new ConflictException('You already have an open shift');
    }

    return this.prisma.shift.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        cashierId: caller.userId,
        openingFloat: dto.openingFloat,
      },
    });
  }

  async close(caller: AuthenticatedUser, shiftId: string, dto: CloseShiftDto) {
    const shift = await this.findOwned(caller, shiftId);
    if (shift.status !== 'OPEN') {
      throw new ConflictException('Shift is already closed');
    }

    const expectedCash = await this.computeExpectedCash(shift.id, shift.openingFloat);
    const variance = new Prisma.Decimal(dto.closingCash).minus(expectedCash);

    return this.prisma.shift.update({
      where: { id: shift.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closingCash: dto.closingCash,
        expectedCash,
        variance,
      },
    });
  }

  async recordCashMovement(caller: AuthenticatedUser, shiftId: string, dto: RecordCashMovementDto) {
    const shift = await this.findOwned(caller, shiftId);
    if (shift.status !== 'OPEN') {
      throw new ConflictException('Shift is not open');
    }

    return this.prisma.cashMovement.create({
      data: { shiftId: shift.id, type: dto.type, amount: dto.amount, reason: dto.reason },
    });
  }

  async findOne(caller: AuthenticatedUser, shiftId: string) {
    return this.findOwned(caller, shiftId);
  }

  async findCurrent(caller: AuthenticatedUser) {
    return this.prisma.shift.findFirst({
      where: { tenantId: caller.tenantId!, cashierId: caller.userId, status: 'OPEN' },
    });
  }

  private async findOwned(caller: AuthenticatedUser, shiftId: string) {
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) {
      throw new NotFoundException();
    }
    assertTenantAccess(caller, shift.tenantId);
    assertBranchAccess(caller, shift.branchId);
    return shift;
  }

  /**
   * expectedCash = opening float + cash sale payments + manual cash-in -
   * manual cash-out - refunds processed against this shift. Refunds are
   * treated as a straight cash deduction regardless of the original sale's
   * payment method - a reasonable simplification for a drawer that doesn't
   * split refund payouts by tender type.
   */
  private async computeExpectedCash(shiftId: string, openingFloat: Prisma.Decimal) {
    const [cashSalesTotal, cashInTotal, cashOutTotal, refundsTotal] = await Promise.all([
      this.sumCashSales(shiftId),
      this.sumCashMovements(shiftId, 'CASH_IN'),
      this.sumCashMovements(shiftId, 'CASH_OUT'),
      this.sumRefunds(shiftId),
    ]);

    return openingFloat
      .plus(cashSalesTotal)
      .plus(cashInTotal)
      .minus(cashOutTotal)
      .minus(refundsTotal);
  }

  private async sumCashSales(shiftId: string): Promise<Prisma.Decimal> {
    const result = await this.prisma.salePayment.aggregate({
      where: { method: 'CASH', sale: { shiftId } },
      _sum: { amount: true },
    });
    return result._sum.amount ?? new Prisma.Decimal(0);
  }

  private async sumCashMovements(
    shiftId: string,
    type: 'CASH_IN' | 'CASH_OUT',
  ): Promise<Prisma.Decimal> {
    const result = await this.prisma.cashMovement.aggregate({
      where: { shiftId, type },
      _sum: { amount: true },
    });
    return result._sum.amount ?? new Prisma.Decimal(0);
  }

  private async sumRefunds(shiftId: string): Promise<Prisma.Decimal> {
    const result = await this.prisma.refund.aggregate({
      where: { shiftId },
      _sum: { amount: true },
    });
    return result._sum.amount ?? new Prisma.Decimal(0);
  }
}
