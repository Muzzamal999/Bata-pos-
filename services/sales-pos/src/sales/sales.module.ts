import { Module } from '@nestjs/common';
import { ProductInventoryClientModule } from '../product-inventory-client/product-inventory-client.module';
import { CatalogModule } from '../catalog/catalog.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [ProductInventoryClientModule, CatalogModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
