import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportingService } from '../reporting/reporting.service';
import { ReportQueryDto, SalesReportQueryDto } from '../reporting/dto/report-query.dto';

export interface BestSellerRow {
  variantId: string;
  totalQuantity: number;
  totalRevenue: string;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reporting: ReportingService,
  ) {}

  /** Sales trend: the same time-bucketed series as the sales report, annotated with period-over-period % change. */
  async salesTrend(tenantId: string, query: SalesReportQueryDto) {
    const buckets = await this.reporting.salesReport(tenantId, query);
    return buckets.map((bucket, i) => {
      const previous = i > 0 ? Number(buckets[i - 1].netAmount) : null;
      const current = Number(bucket.netAmount);
      const changePercent =
        previous === null || previous === 0
          ? null
          : (((current - previous) / previous) * 100).toFixed(2);
      return { ...bucket, changePercent };
    });
  }

  async bestSellingProducts(tenantId: string, query: ReportQueryDto, limit = 10) {
    const clauses: Prisma.Sql[] = [];
    if (query.branchId) clauses.push(Prisma.sql`AND "branchId" = ${query.branchId}::uuid`);
    if (query.from) clauses.push(Prisma.sql`AND "occurredAt" >= ${new Date(query.from)}`);
    if (query.to) clauses.push(Prisma.sql`AND "occurredAt" <= ${new Date(query.to)}`);
    const filters = clauses.length > 0 ? Prisma.join(clauses, ' ') : Prisma.empty;

    return this.prisma.$queryRaw<BestSellerRow[]>(Prisma.sql`
      SELECT "variantId",
             SUM("quantity")::int AS "totalQuantity",
             SUM("quantity" * "unitPrice")::text AS "totalRevenue"
      FROM sale_line_records
      WHERE "tenantId" = ${tenantId}::uuid
      ${filters}
      GROUP BY "variantId"
      ORDER BY "totalQuantity" DESC
      LIMIT ${limit}
    `);
  }

  async branchComparison(tenantId: string, query: ReportQueryDto) {
    const [sales, inventory] = await Promise.all([
      this.reporting.salesByBranch(tenantId, query),
      this.reporting.inventorySummary(tenantId, query),
    ]);

    const movementsByBranch = new Map<string, { netQuantity: number; movementCount: number }>();
    for (const row of inventory) {
      const existing = movementsByBranch.get(row.branchId) ?? { netQuantity: 0, movementCount: 0 };
      existing.netQuantity += row.netQuantity;
      existing.movementCount += row.movementCount;
      movementsByBranch.set(row.branchId, existing);
    }

    return sales.map((s) => ({
      ...s,
      inventoryMovementCount: movementsByBranch.get(s.branchId)?.movementCount ?? 0,
      inventoryNetQuantity: movementsByBranch.get(s.branchId)?.netQuantity ?? 0,
    }));
  }

  /** Inventory performance: same net-movement data as the reporting summary, ranked by turnover (movement count). */
  async inventoryPerformance(tenantId: string, query: ReportQueryDto) {
    const summary = await this.reporting.inventorySummary(tenantId, query);
    return [...summary].sort((a, b) => b.movementCount - a.movementCount);
  }

  async salesSummary(tenantId: string, query: ReportQueryDto) {
    const [branchTotals, cashierTotals] = await Promise.all([
      this.reporting.salesByBranch(tenantId, query),
      this.reporting.cashierPerformance(tenantId, query),
    ]);

    const totalGross = branchTotals.reduce((sum, b) => sum + Number(b.grossAmount), 0);
    const totalRefunded = branchTotals.reduce((sum, b) => sum + Number(b.refundedAmount), 0);
    const totalSales = branchTotals.reduce((sum, b) => sum + b.saleCount, 0);

    return {
      totalSales,
      totalGross: totalGross.toFixed(2),
      totalRefunded: totalRefunded.toFixed(2),
      totalNet: (totalGross - totalRefunded).toFixed(2),
      branchCount: branchTotals.length,
      cashierCount: cashierTotals.length,
    };
  }

  async dashboardKpis(tenantId: string, query: ReportQueryDto) {
    const [summary, bestSellers, balances] = await Promise.all([
      this.salesSummary(tenantId, query),
      this.bestSellingProducts(tenantId, query, 5),
      this.reporting.currentStockBalances(tenantId, query.branchId),
    ]);

    return {
      ...summary,
      topProducts: bestSellers,
      outOfStockVariantCount: balances.filter((b) => b.balance <= 0).length,
      trackedVariantCount: balances.length,
    };
  }
}
