import { Module } from '@nestjs/common';
import { ReportingModule } from '../reporting/reporting.module';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { ERP_ADAPTER } from './adapters/erp-adapter.interface';
import { PAYMENT_ADAPTER } from './adapters/payment-adapter.interface';
import { NOTIFICATION_ADAPTER } from './adapters/notification-adapter.interface';
import { MockErpAdapter } from './adapters/mock/mock-erp.adapter';
import { MockPaymentAdapter } from './adapters/mock/mock-payment.adapter';
import { MockNotificationAdapter } from './adapters/mock/mock-notification.adapter';

@Module({
  imports: [ReportingModule],
  controllers: [IntegrationController],
  providers: [
    IntegrationService,
    { provide: ERP_ADAPTER, useClass: MockErpAdapter },
    { provide: PAYMENT_ADAPTER, useClass: MockPaymentAdapter },
    { provide: NOTIFICATION_ADAPTER, useClass: MockNotificationAdapter },
  ],
})
export class IntegrationModule {}
