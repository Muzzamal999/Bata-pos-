import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ProductInventoryClientService } from './product-inventory-client.service';

@Module({
  imports: [HttpModule.register({ timeout: 5000 })],
  providers: [ProductInventoryClientService],
  exports: [ProductInventoryClientService],
})
export class ProductInventoryClientModule {}
