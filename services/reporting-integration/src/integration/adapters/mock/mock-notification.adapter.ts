import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AdapterResult } from '../erp-adapter.interface';
import { NotificationAdapter, NotificationRequest } from '../notification-adapter.interface';

@Injectable()
export class MockNotificationAdapter implements NotificationAdapter {
  private readonly logger = new Logger(MockNotificationAdapter.name);

  async send(request: NotificationRequest): Promise<AdapterResult> {
    this.logger.log(`[MOCK NOTIFICATION] Would send to ${request.recipient}: "${request.subject}"`);
    return {
      success: true,
      reference: randomUUID(),
      message: 'Mock notification adapter - nothing was actually sent',
    };
  }
}
