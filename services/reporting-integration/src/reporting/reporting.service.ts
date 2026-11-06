import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportQueryDto, SalesReportQueryDto } from './dto/report-query.dto';

export interface SalesBucketRow {
  bucket: Date;
  saleCount: number;
  grossAmount: string;
  refundedAmount: string;
}

export interface BranchSalesRow {
  branchId: string;
  saleCount: number;
  grossAmount: string;
  refundedAmount: string;
}

export interface CashierSalesRow {
  cashierId: string | null;
  saleCount: number;
  grossAmount: string;
}

export interface PaymentSummaryRow {
  paymentMethod: string | null;
  saleCount: number;
  grossAmount: string;
}

export interface InventorySummaryRow {
  variantId: string;
  branchId: string;
  netQuantity: number;
  movementCount: number;
}

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  private dateFilter(column: string, from?: string, to?: string): Prisma.Sql {
    const clauses: Prisma.Sql[] = [];
    if (from) clauses.push(Prisma.sql`AND ${Prisma.raw(column)} >= ${new Date(from)}`);
    if (to) clauses.push(Prisma.sql`AND ${Prisma.raw(column)} <= ${new Date(to)}`);
    return clauses.length > 0 ? Prisma.join(clauses, ' ') : Prisma.empty;
  }

  async salesReport(tenantId: string, query: SalesReportQueryDto) {
    const periodUnit = { daily: 'day', weekly: 'week', monthly: 'month' }[query.period ?? 'daily'];

    const rows = await this.prisma.$queryRaw<SalesBucketRow[]>(Prisma.sql`
      SELECT date_trunc(${periodUnit}, "occurredAt") AS bucket,
             COUNT(*)::int AS "saleCount",
             COALESCE(SUM("totalAmount"), 0)::text AS "grossAmount",
             COALESCE(SUM(CASE WHEN status = 'REFUNDED' THEN "refundAmount" ELSE 0 END), 0)::text AS "refundedAmount"
      FROM sale_records
      WHERE "tenantId" = ${tenantId}::uuid
      ${query.branchId ? Prisma.sql`AND "branchId" = ${query.branchId}::uuid` : Prisma.empty}
      ${this.dateFilter('"occurredAt"', query.from, query.to)}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    return rows.map((r) => ({
      period: r.bucket.toISOString(),
      saleCount: r.saleCount,
      grossAmount: r.grossAmount,
      refundedAmount: r.refundedAmount,
      netAmount: (Number(r.grossAmount) - Number(r.refundedAmount)).toFixed(2),
    }));
  }

  async salesByBranch(tenantId: string, query: ReportQueryDto) {
    const rows = await this.prisma.$queryRaw<BranchSalesRow[]>(Prisma.sql`
      SELECT "branchId",
             COUNT(*)::int AS "saleCount",
             COALESCE(SUM("totalAmount"), 0)::text AS "grossAmount",
             COALESCE(SUM(CASE WHEN status = 'REFUNDED' THEN "refundAmount" ELSE 0 END), 0)::text AS "refundedAmount"
      FROM sale_records
      WHERE "tenantId" = ${tenantId}::uuid
      ${this.dateFilter('"occurredAt"', query.from, query.to)}
      GROUP BY "branchId"
      ORDER BY "grossAmount" DESC
    `);

    return rows.map((r) => ({
      branchId: r.branchId,
      saleCount: r.saleCount,
      grossAmount: r.grossAmount,
      refundedAmount: r.refundedAmount,
      netAmount: (Number(r.grossAmount) - Number(r.refundedAmount)).toFixed(2),
    }));
  }

  async cashierPerformance(tenantId: string, query: ReportQueryDto) {
    const rows = await this.prisma.$queryRaw<CashierSalesRow[]>(Prisma.sql`
      SELECT "cashierId",
             COUNT(*)::int AS "saleCount",
             COALESCE(SUM("totalAmount"), 0)::text AS "grossAmount"
      FROM sale_records
      WHERE "tenantId" = ${tenantId}::uuid
      ${query.branchId ? Prisma.sql`AND "branchId" = ${query.branchId}::uuid` : Prisma.empty}
      ${this.dateFilter('"occurredAt"', query.from, query.to)}
      GROUP BY "cashierId"
      ORDER BY "grossAmount" DESC
    `);

    return rows;
  }

  async paymentSummary(tenantId: string, query: ReportQueryDto) {
    const rows = await this.prisma.$queryRaw<PaymentSummaryRow[]>(Prisma.sql`
      SELECT "paymentMethod",
             COUNT(*)::int AS "saleCount",
             COALESCE(SUM("totalAmount"), 0)::text AS "grossAmount"
      FROM sale_records
      WHERE "tenantId" = ${tenantId}::uuid
      ${query.branchId ? Prisma.sql`AND "branchId" = ${query.branchId}::uuid` : Prisma.empty}
      ${this.dateFilter('"occurredAt"', query.from, query.to)}
      GROUP BY "paymentMethod"
      ORDER BY "grossAmount" DESC
    `);

    return rows;
  }

  async stockMovements(tenantId: string, query: ReportQueryDto, page: number, limit: number) {
    const where: Prisma.StockMovementRecordWhereInput = {
      tenantId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.stockMovementRecord.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.stockMovementRecord.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async inventorySummary(tenantId: string, query: ReportQueryDto) {
    const rows = await this.prisma.$queryRaw<InventorySummaryRow[]>(Prisma.sql`
      SELECT "variantId", "branchId",
             COALESCE(SUM("quantity"), 0)::int AS "netQuantity",
             COUNT(*)::int AS "movementCount"
      FROM stock_movement_records
      WHERE "tenantId" = ${tenantId}::uuid
      ${query.branchId ? Prisma.sql`AND "branchId" = ${query.branchId}::uuid` : Prisma.empty}
      ${this.dateFilter('"occurredAt"', query.from, query.to)}
      GROUP BY "variantId", "branchId"
      ORDER BY "netQuantity" ASC
    `);

    return rows;
  }

  /**
   * The current known balance per variant/branch, as of each one's most
   * recent movement that actually carried a balanceAfter (StockTransferReceived
   * lines don't). This is a real current-balance signal, unlike a sum of
   * deltas over an arbitrary date range - it ignores the `from`/`to` filters
   * on purpose, since "current" only means anything as of now.
   */
  async currentStockBalances(tenantId: string, branchId?: string) {
    return this.prisma.$queryRaw<{ variantId: string; branchId: string; balance: number }[]>(
      Prisma.sql`
        SELECT DISTINCT ON ("variantId", "branchId") "variantId", "branchId",
               "balanceAfter" AS "balance"
        FROM stock_movement_records
        WHERE "tenantId" = ${tenantId}::uuid AND "balanceAfter" IS NOT NULL
        ${branchId ? Prisma.sql`AND "branchId" = ${branchId}::uuid` : Prisma.empty}
        ORDER BY "variantId", "branchId", "occurredAt" DESC
      `,
    );
  }

  async productPerformance(tenantId: string, query: ReportQueryDto) {
    const [priceActivity, stockActivity] = await Promise.all([
      this.prisma.$queryRaw<
        { variantId: string; priceChangeCount: number; latestAmount: string }[]
      >(
        Prisma.sql`
          SELECT DISTINCT ON ("variantId") "variantId",
                 COUNT(*) OVER (PARTITION BY "variantId")::int AS "priceChangeCount",
                 "amount"::text AS "latestAmount"
          FROM price_change_records
          WHERE "tenantId" = ${tenantId}::uuid AND "variantId" IS NOT NULL
          ${this.dateFilter('"occurredAt"', query.from, query.to)}
          ORDER BY "variantId", "occurredAt" DESC
        `,
      ),
      this.inventorySummary(tenantId, query),
    ]);

    const stockByVariant = new Map(stockActivity.map((s) => [s.variantId, s]));
    const variantIds = new Set([
      ...priceActivity.map((p) => p.variantId),
      ...stockActivity.map((s) => s.variantId),
    ]);

    return Array.from(variantIds).map((variantId) => {
      const price = priceActivity.find((p) => p.variantId === variantId);
      const stock = stockByVariant.get(variantId);
      return {
        variantId,
        priceChangeCount: price?.priceChangeCount ?? 0,
        latestAmount: price?.latestAmount ?? null,
        netStockQuantity: stock?.netQuantity ?? 0,
        movementCount: stock?.movementCount ?? 0,
      };
    });
  }

  profitAndLoss() {
    return {
      available: false,
      reason:
        'Product & Inventory tracks selling price only, not cost of goods. Reliable cost data is not available anywhere in the platform today, so profit and loss cannot be computed.',
    };
  }
}
