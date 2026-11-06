import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AdapterResult, ErpAdapter, ErpSalesSummary } from '../erp-adapter.interface';

@Injectable()
export class MockErpAdapter implements ErpAdapter {
  private readonly logger = new Logger(MockErpAdapter.name);

  async pushSalesSummary(summary: ErpSalesSummary): Promise<AdapterResult> {
    this.logger.log(`[MOCK ERP] Would push sales summary: ${JSON.stringify(summary)}`);
    return {
      success: true,
      reference: randomUUID(),
      message: 'Mock ERP adapter - no real system called',
    };
  }
}
