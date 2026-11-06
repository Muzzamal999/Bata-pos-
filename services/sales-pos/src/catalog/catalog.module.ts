import { Module } from '@nestjs/common';
import { ProductInventoryClientModule } from '../product-inventory-client/product-inventory-client.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [ProductInventoryClientModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
