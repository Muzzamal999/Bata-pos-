import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductInventoryClientService } from '../product-inventory-client/product-inventory-client.service';

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productInventoryClient: ProductInventoryClientService,
  ) {}

  async lookupByBarcode(tenantId: string, barcode: string) {
    return this.prisma.catalogCacheEntry.findFirst({
      where: { tenantId, barcodes: { has: barcode } },
    });
  }

  async getNameByVariantId(tenantId: string, variantId: string): Promise<string | null> {
    const entry = await this.prisma.catalogCacheEntry.findUnique({
      where: { tenantId_variantId: { tenantId, variantId } },
    });
    return entry?.productName ?? null;
  }

  async search(tenantId: string, query: string, limit = 20) {
    return this.prisma.catalogCacheEntry.findMany({
      where: {
        tenantId,
        OR: [
          { productName: { contains: query, mode: 'insensitive' } },
          { articleNumber: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
    });
  }

  /**
   * Full re-sync against Product & Inventory's REST API. Populates
   * name/article number/barcodes only - price is deliberately left for the
   * PriceUpdated consumer or a live resolve at checkout, never from a sync
   * that could be minutes stale.
   */
  async syncFromProductInventory(tenantId: string, bearerToken: string): Promise<number> {
    let page = 1;
    const limit = 50;
    let synced = 0;

    for (;;) {
      const { data: products, total } = await this.productInventoryClient.listProducts(
        bearerToken,
        page,
        limit,
      );
      for (const product of products) {
        synced += await this.syncProductVariants(tenantId, bearerToken, product);
      }
      if (page * limit >= total || products.length === 0) {
        break;
      }
      page += 1;
    }

    this.logger.log(`Catalog sync complete for tenant ${tenantId}: ${synced} variants`);
    return synced;
  }

  async resyncProduct(
    tenantId: string,
    bearerToken: string,
    product: { id: string; name: string; articleNumber: string },
  ): Promise<number> {
    return this.syncProductVariants(tenantId, bearerToken, product);
  }

  private async syncProductVariants(
    tenantId: string,
    bearerToken: string,
    product: { id: string; name: string; articleNumber: string },
  ): Promise<number> {
    const variants = await this.productInventoryClient.listVariants(bearerToken, product.id);
    for (const variant of variants) {
      await this.prisma.catalogCacheEntry.upsert({
        where: { tenantId_variantId: { tenantId, variantId: variant.id } },
        create: {
          tenantId,
          variantId: variant.id,
          productId: product.id,
          productName: product.name,
          articleNumber: product.articleNumber,
          barcodes: variant.barcodes.map((b) => b.code),
          lastSyncedAt: new Date(),
        },
        update: {
          productName: product.name,
          articleNumber: product.articleNumber,
          barcodes: variant.barcodes.map((b) => b.code),
          lastSyncedAt: new Date(),
        },
      });
    }
    return variants.length;
  }

  async updatePriceFromEvent(
    tenantId: string,
    variantId: string,
    amount: string,
    currency: string,
  ): Promise<void> {
    await this.prisma.catalogCacheEntry.updateMany({
      where: { tenantId, variantId },
      data: { price: amount, currency },
    });
  }
}
