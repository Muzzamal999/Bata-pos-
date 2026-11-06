import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EventDispatcherService } from '../src/events/event-dispatcher.service';
import { CONSUMED_EVENTS } from '../src/events/consumed-events.constant';
import { PERMISSIONS } from '../src/common/constants/permissions.constant';

describe('Audit endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dispatcher: EventDispatcherService;

  const secret = process.env.JWT_ACCESS_SECRET!;
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const branchId = randomUUID();

  function tokenFor(forTenantId: string | null, permissions: string[]) {
    return jwt.sign(
      {
        sub: randomUUID(),
        tenantId: forTenantId,
        branchIds: [],
        roles: [],
        permissions,
        type: 'access',
      },
      secret,
      { expiresIn: '15m' },
    );
  }

  const token = tokenFor(tenantId, [PERMISSIONS.AUDIT_READ]);
  const otherTenantToken = tokenFor(otherTenantId, [PERMISSIONS.AUDIT_READ]);
  const noPermissionToken = tokenFor(tenantId, []);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    dispatcher = app.get(EventDispatcherService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.priceChangeRecord.deleteMany();
    await prisma.processedEvent.deleteMany();
  });

  function as(bearer: string) {
    return {
      get: (url: string) =>
        request(app.getHttpServer()).get(`/api/v1${url}`).set('Authorization', `Bearer ${bearer}`),
    };
  }

  async function seedPriceUpdate() {
    const priceId = randomUUID();
    await dispatcher.dispatch({
      id: randomUUID(),
      eventType: CONSUMED_EVENTS.PRICE_UPDATED,
      eventVersion: '1',
      tenantId,
      occurredAt: new Date().toISOString(),
      payload: {
        priceId,
        productId: null,
        variantId: randomUUID(),
        branchId,
        amount: '750.00',
        currency: 'PKR',
      },
    });
    return priceId;
  }

  it('requires the audit.read permission', async () => {
    await as(noPermissionToken).get('/audit').expect(403);
  });

  it("lists audit log entries for the caller's own tenant, paginated", async () => {
    const priceId = await seedPriceUpdate();

    const res = await as(token).get('/audit?entityType=Price').expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.items.some((e: { entityId: string }) => e.entityId === priceId)).toBe(true);
  });

  it("a tenant-scoped caller only sees their own tenant's entries", async () => {
    await seedPriceUpdate();

    const res = await as(otherTenantToken).get('/audit').expect(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("GET /audit/:id returns a single entry within the caller's tenant", async () => {
    await seedPriceUpdate();
    const list = await as(token).get('/audit').expect(200);
    const entryId = list.body.items[0].id;

    const res = await as(token).get(`/audit/${entryId}`).expect(200);
    expect(res.body.id).toBe(entryId);
  });

  it('GET /audit/:id returns 404 (not 403) for an entry in another tenant', async () => {
    await seedPriceUpdate();
    const list = await as(token).get('/audit').expect(200);
    const entryId = list.body.items[0].id;

    await as(otherTenantToken).get(`/audit/${entryId}`).expect(404);
  });

  it('GET /audit/:id returns 404 for a nonexistent id', async () => {
    await as(token).get(`/audit/${randomUUID()}`).expect(404);
  });

  it('exposes no mutation routes for audit entries', async () => {
    await seedPriceUpdate();
    const list = await as(token).get('/audit').expect(200);
    const entryId = list.body.items[0].id;

    await request(app.getHttpServer())
      .patch(`/api/v1/audit/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/audit/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
