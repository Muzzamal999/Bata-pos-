import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import configuration from '../src/config/configuration';
import { ProductInventoryClientService } from '../src/product-inventory-client/product-inventory-client.service';

/**
 * Exercises ProductInventoryClientService against the REAL running
 * Product & Inventory service - no mocks. This is specifically what the
 * other catalog e2e tests don't cover (they mock this client entirely),
 * and is exactly the gap that let listVariants silently return the wrong
 * shape ({data,total,...} unwrapped as if it were a bare array) until this
 * test caught it.
 */
describe('ProductInventoryClientService (e2e, real backend)', () => {
  let service: ProductInventoryClientService;
  const secret = process.env.JWT_ACCESS_SECRET!;
  const tenantId = randomUUID();

  function token(permissions: string[]) {
    return jwt.sign(
      { sub: randomUUID(), tenantId, branchIds: [], roles: [], permissions, type: 'access' },
      secret,
      { expiresIn: '15m' },
    );
  }

  beforeAll(async () => {
    const config = configuration();
    const configService = new ConfigService(config);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HttpModule.register({ timeout: 5000 })],
      providers: [
        { provide: ConfigService, useValue: configService },
        ProductInventoryClientService,
      ],
    }).compile();

    service = moduleFixture.get(ProductInventoryClientService);
  });

  it('listVariants returns the real variant array, correctly unwrapped from the paginated response', async () => {
    const creatorToken = token([
      'products.create',
      'variants.create',
      'variants.read',
      'barcodes.create',
    ]);

    const productRes = await fetch(`${configuration().productInventory.baseUrl}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creatorToken}` },
      body: JSON.stringify({ articleNumber: `PIC-${Date.now()}`, name: 'Client Test Product' }),
    });
    const product = await productRes.json();
    if (!productRes.ok) throw new Error(`Setup failed: ${JSON.stringify(product)}`);

    const variantRes = await fetch(
      `${configuration().productInventory.baseUrl}/products/${product.id}/variants`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creatorToken}` },
        body: JSON.stringify({ size: '99', color: 'TestColor' }),
      },
    );
    const variant = await variantRes.json();
    if (!variantRes.ok) throw new Error(`Setup failed: ${JSON.stringify(variant)}`);

    const variants = await service.listVariants(creatorToken, product.id);

    expect(Array.isArray(variants)).toBe(true);
    expect(variants).toHaveLength(1);
    expect(variants[0].id).toBe(variant.id);
    expect(Array.isArray(variants[0].barcodes)).toBe(true);
  }, 15000);
});
