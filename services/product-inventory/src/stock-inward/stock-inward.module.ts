import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { StockInwardController } from './stock-inward.controller';
import { StockInwardService } from './stock-inward.service';

@Module({
  imports: [InventoryModule],
  controllers: [StockInwardController],
  providers: [StockInwardService],
  exports: [StockInwardService],
})
export class StockInwardModule {}
