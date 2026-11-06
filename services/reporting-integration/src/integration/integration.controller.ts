import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { requireTenantScope } from '../common/utils/tenant-scope.util';
import { IntegrationService } from './integration.service';
import { TriggerErpSyncDto } from './dto/trigger-erp-sync.dto';
import { SendNotificationDto } from './dto/send-notification.dto';

class ReconciliationQueryDto {
  @ApiPropertyOptional()
  @IsUUID()
  branchId!: string;

  @ApiPropertyOptional()
  @IsDateString()
  periodStart!: string;

  @ApiPropertyOptional()
  @IsDateString()
  periodEnd!: string;
}

@ApiTags('integration')
@ApiBearerAuth()
@Controller('integration')
@RequirePermissions(PERMISSIONS.INTEGRATION_READ)
export class IntegrationController {
  constructor(private readonly integration: IntegrationService) {}

  @Get('status')
  status() {
    return this.integration.status();
  }

  @Post('erp/sync')
  triggerErpSync(@CurrentUser() user: AuthenticatedUser, @Body() dto: TriggerErpSyncDto) {
    const tenantId = requireTenantScope(user, undefined);
    return this.integration.triggerErpSync(tenantId, dto);
  }

  @Post('payments/reconcile')
  triggerPaymentReconciliation(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReconciliationQueryDto,
  ) {
    const tenantId = requireTenantScope(user, undefined);
    return this.integration.triggerPaymentReconciliation(
      tenantId,
      query.branchId,
      query.periodStart,
      query.periodEnd,
    );
  }

  @Post('notifications/send')
  sendNotification(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendNotificationDto) {
    const tenantId = requireTenantScope(user, undefined);
    return this.integration.sendNotification(tenantId, dto);
  }
}
