import { Inject, Injectable } from '@nestjs/common';
import { ReportingService } from '../reporting/reporting.service';
import { ErpAdapter, ERP_ADAPTER } from './adapters/erp-adapter.interface';
import { PaymentAdapter, PAYMENT_ADAPTER } from './adapters/payment-adapter.interface';
import {
  NotificationAdapter,
  NOTIFICATION_ADAPTER,
} from './adapters/notification-adapter.interface';
import { TriggerErpSyncDto } from './dto/trigger-erp-sync.dto';
import { SendNotificationDto } from './dto/send-notification.dto';

@Injectable()
export class IntegrationService {
  constructor(
    @Inject(ERP_ADAPTER) private readonly erpAdapter: ErpAdapter,
    @Inject(PAYMENT_ADAPTER) private readonly paymentAdapter: PaymentAdapter,
    @Inject(NOTIFICATION_ADAPTER) private readonly notificationAdapter: NotificationAdapter,
    private readonly reporting: ReportingService,
  ) {}

  status() {
    return {
      erp: { mode: 'mock', configured: false },
      payment: { mode: 'mock', configured: false },
      notification: { mode: 'mock', configured: false },
      note: 'No real external providers are integrated yet. Adapter interfaces exist so a real implementation can be dropped in later without touching the reporting/analytics code that calls them.',
    };
  }

  async triggerErpSync(tenantId: string, dto: TriggerErpSyncDto) {
    const branchTotals = await this.reporting.salesByBranch(tenantId, {
      branchId: dto.branchId,
      from: dto.periodStart,
      to: dto.periodEnd,
    });
    const totals = branchTotals[0] ?? { saleCount: 0, grossAmount: '0.00' };

    return this.erpAdapter.pushSalesSummary({
      tenantId,
      branchId: dto.branchId,
      periodStart: dto.periodStart,
      periodEnd: dto.periodEnd,
      totalAmount: totals.grossAmount,
      saleCount: totals.saleCount,
    });
  }

  async triggerPaymentReconciliation(
    tenantId: string,
    branchId: string,
    periodStart: string,
    periodEnd: string,
  ) {
    return this.paymentAdapter.reconcile({ tenantId, branchId, periodStart, periodEnd });
  }

  async sendNotification(tenantId: string, dto: SendNotificationDto) {
    return this.notificationAdapter.send({ tenantId, ...dto });
  }
}
