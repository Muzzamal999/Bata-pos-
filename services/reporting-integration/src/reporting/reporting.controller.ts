import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { requireTenantScope } from '../common/utils/tenant-scope.util';
import { ReportingService } from './reporting.service';
import {
  ReportQueryDto,
  SalesReportQueryDto,
  StockMovementsQueryDto,
} from './dto/report-query.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@RequirePermissions(PERMISSIONS.REPORTS_READ)
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('sales')
  salesReport(@CurrentUser() user: AuthenticatedUser, @Query() query: SalesReportQueryDto) {
    const tenantId = requireTenantScope(user, query.tenantId);
    return this.reporting.salesReport(tenantId, query);
  }

  @Get('sales/by-branch')
  salesByBranch(@CurrentUser() user: AuthenticatedUser, @Query() query: ReportQueryDto) {
    const tenantId = requireTenantScope(user, query.tenantId);
    return this.reporting.salesByBranch(tenantId, query);
  }

  @Get('sales/by-cashier')
  cashierPerformance(@CurrentUser() user: AuthenticatedUser, @Query() query: ReportQueryDto) {
    const tenantId = requireTenantScope(user, query.tenantId);
    return this.reporting.cashierPerformance(tenantId, query);
  }

  @Get('payments/summary')
  paymentSummary(@CurrentUser() user: AuthenticatedUser, @Query() query: ReportQueryDto) {
    const tenantId = requireTenantScope(user, query.tenantId);
    return this.reporting.paymentSummary(tenantId, query);
  }

  @Get('inventory/movements')
  stockMovements(@CurrentUser() user: AuthenticatedUser, @Query() query: StockMovementsQueryDto) {
    const tenantId = requireTenantScope(user, query.tenantId);
    return this.reporting.stockMovements(tenantId, query, query.page, query.limit);
  }

  @Get('inventory/summary')
  inventorySummary(@CurrentUser() user: AuthenticatedUser, @Query() query: ReportQueryDto) {
    const tenantId = requireTenantScope(user, query.tenantId);
    return this.reporting.inventorySummary(tenantId, query);
  }

  @Get('products/performance')
  productPerformance(@CurrentUser() user: AuthenticatedUser, @Query() query: ReportQueryDto) {
    const tenantId = requireTenantScope(user, query.tenantId);
    return this.reporting.productPerformance(tenantId, query);
  }

  @Get('profit-loss')
  profitAndLoss() {
    return this.reporting.profitAndLoss();
  }
}
