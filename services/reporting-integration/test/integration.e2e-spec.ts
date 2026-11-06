import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PERMISSIONS } from '../src/common/constants/permissions.constant';

describe('Integration endpoints (e2e)', () => {
  let app: INestApplication;

  const secret = process.env.JWT_ACCESS_SECRET!;
  const tenantId = randomUUID();
  const branchId = randomUUID();

  function tokenFor(permissions: string[]) {
    return jwt.sign(
      { sub: randomUUID(), tenantId, branchIds: [], roles: [], permissions, type: 'access' },
      secret,
      { expiresIn: '15m' },
    );
  }

  const token = tokenFor([PERMISSIONS.INTEGRATION_READ]);
  const noPermissionToken = tokenFor([]);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function as(bearer: string) {
    return {
      get: (url: string) =>
        request(app.getHttpServer()).get(`/api/v1${url}`).set('Authorization', `Bearer ${bearer}`),
      post: (url: string, body: object = {}) =>
        request(app.getHttpServer())
          .post(`/api/v1${url}`)
          .set('Authorization', `Bearer ${bearer}`)
          .send(body),
    };
  }

  it('requires the integration.read permission', async () => {
    await as(noPermissionToken).get('/integration/status').expect(403);
  });

  it('status reports all adapters as mock, not real', async () => {
    const res = await as(token).get('/integration/status').expect(200);
    expect(res.body.erp.mode).toBe('mock');
    expect(res.body.payment.mode).toBe('mock');
    expect(res.body.notification.mode).toBe('mock');
  });

  it('erp/sync returns a mock success result without calling a real ERP', async () => {
    const res = await as(token)
      .post('/integration/erp/sync', {
        branchId,
        periodStart: new Date(Date.now() - 86400000).toISOString(),
        periodEnd: new Date().toISOString(),
      })
      .expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.reference).toBeDefined();
  });

  it('payments/reconcile returns a mock reconciliation result', async () => {
    const res = await as(token)
      .post(
        `/integration/payments/reconcile?branchId=${branchId}&periodStart=${encodeURIComponent(
          new Date(Date.now() - 86400000).toISOString(),
        )}&periodEnd=${encodeURIComponent(new Date().toISOString())}`,
      )
      .expect(201);
    expect(res.body.success).toBe(true);
  });

  it('notifications/send returns a mock delivery result without sending anything real', async () => {
    const res = await as(token)
      .post('/integration/notifications/send', {
        recipient: 'owner@example.com',
        subject: 'Daily summary',
        body: 'Mock notification body',
      })
      .expect(201);
    expect(res.body.success).toBe(true);
  });
});
