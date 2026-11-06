import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { requireTenantScope } from '../common/utils/tenant-scope.util';
import { AnalyticsService } from './analytics.service';
import { ReportQueryDto, SalesReportQueryDto } from '../reporting/dto/report-query.dto';
import { BestSellersQueryDto } from './dto/best-sellers-query.dto';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
@RequirePermissions(PERMISSIONS.ANALYTICS_READ)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('sales-trend')
  salesTrend(@CurrentUser() user: AuthenticatedUser, @Query() query: SalesReportQueryDto) {
    const tenantId = requireTenantScope(user, query.tenantId);
    return this.analytics.salesTrend(tenantId, query);
  }

  @Get('best-selling-products')
  bestSellingProducts(@CurrentUser() user: AuthenticatedUser, @Query() query: BestSellersQueryDto) {
    const tenantId = requireTenantScope(user, query.tenantId);
    return this.analytics.bestSellingProducts(tenantId, query, query.limit);
  }

  @Get('branch-comparison')
  branchComparison(@CurrentUser() user: AuthenticatedUser, @Query() query: ReportQueryDto) {
    const tenantId = requireTenantScope(user, query.tenantId);
    return this.analytics.branchComparison(tenantId, query);
  }

  @Get('inventory-performance')
  inventoryPerformance(@CurrentUser() user: AuthenticatedUser, @Query() query: ReportQueryDto) {
    const tenantId = requireTenantScope(user, query.tenantId);
    return this.analytics.inventoryPerformance(tenantId, query);
  }

  @Get('sales-summary')
  salesSummary(@CurrentUser() user: AuthenticatedUser, @Query() query: ReportQueryDto) {
    const tenantId = requireTenantScope(user, query.tenantId);
    return this.analytics.salesSummary(tenantId, query);
  }

  @Get('dashboard-kpis')
  dashboardKpis(@CurrentUser() user: AuthenticatedUser, @Query() query: ReportQueryDto) {
    const tenantId = requireTenantScope(user, query.tenantId);
    return this.analytics.dashboardKpis(tenantId, query);
  }
}
