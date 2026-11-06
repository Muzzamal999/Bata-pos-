import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  PaymentAdapter,
  PaymentReconciliationRequest,
  PaymentReconciliationResult,
} from '../payment-adapter.interface';

@Injectable()
export class MockPaymentAdapter implements PaymentAdapter {
  private readonly logger = new Logger(MockPaymentAdapter.name);

  async reconcile(request: PaymentReconciliationRequest): Promise<PaymentReconciliationResult> {
    this.logger.log(`[MOCK PAYMENT] Would reconcile: ${JSON.stringify(request)}`);
    return {
      success: true,
      reference: randomUUID(),
      message: 'Mock payment adapter - no real gateway called',
      matchedCount: 0,
      unmatchedCount: 0,
    };
  }
}
