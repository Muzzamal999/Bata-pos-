import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PERMISSIONS } from '../src/common/constants/permissions.constant';

describe('Shifts endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const secret = process.env.JWT_ACCESS_SECRET!;
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const userId = randomUUID();
  const allPermissions = [
    PERMISSIONS.SHIFTS_OPEN,
    PERMISSIONS.SHIFTS_CLOSE,
    PERMISSIONS.SHIFTS_READ,
  ];

  function tokenFor(forUserId: string, branchIds: string[], permissions: string[]) {
    return jwt.sign(
      { sub: forUserId, tenantId, branchIds, roles: [], permissions, type: 'access' },
      secret,
      { expiresIn: '15m' },
    );
  }

  const token = tokenFor(userId, [], allPermissions);
  const restrictedBranchToken = tokenFor(randomUUID(), [randomUUID()], allPermissions);
  const noPermissionToken = tokenFor(userId, [], []);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.cashMovement.deleteMany();
    await prisma.refund.deleteMany();
    await prisma.salePayment.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.shift.deleteMany();
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

  it('requires the shifts.open permission', async () => {
    await as(noPermissionToken).post('/shifts', { branchId, openingFloat: 5000 }).expect(403);
  });

  it('opens a shift with the given opening float', async () => {
    const res = await as(token).post('/shifts', { branchId, openingFloat: 5000 }).expect(201);
    expect(res.body.status).toBe('OPEN');
    expect(Number(res.body.openingFloat)).toBe(5000);
  });

  it('rejects opening a second shift while one is already open', async () => {
    await as(token).post('/shifts', { branchId, openingFloat: 5000 }).expect(201);
    await as(token).post('/shifts', { branchId, openingFloat: 5000 }).expect(409);
  });

  it('rejects opening a shift at a branch the caller cannot access', async () => {
    await as(restrictedBranchToken).post('/shifts', { branchId, openingFloat: 5000 }).expect(404);
  });

  it("GET /shifts/current returns the caller's open shift", async () => {
    const opened = await as(token).post('/shifts', { branchId, openingFloat: 5000 }).expect(201);
    const res = await as(token).get('/shifts/current').expect(200);
    expect(res.body.id).toBe(opened.body.id);
  });

  it('records cash-in and cash-out movements against an open shift', async () => {
    const opened = await as(token).post('/shifts', { branchId, openingFloat: 5000 }).expect(201);

    await as(token)
      .post(`/shifts/${opened.body.id}/cash-movements`, { type: 'CASH_IN', amount: 200 })
      .expect(201);
    await as(token)
      .post(`/shifts/${opened.body.id}/cash-movements`, {
        type: 'CASH_OUT',
        amount: 50,
        reason: 'Petty cash',
      })
      .expect(201);

    const movements = await prisma.cashMovement.findMany({ where: { shiftId: opened.body.id } });
    expect(movements).toHaveLength(2);
  });

  it('close computes expected cash from opening float + cash sales + cash movements - refunds', async () => {
    const opened = await as(token).post('/shifts', { branchId, openingFloat: 1000 }).expect(201);
    const shiftId = opened.body.id;

    const sale = await prisma.sale.create({
      data: {
        tenantId,
        branchId,
        cashierId: userId,
        shiftId,
        subtotal: 500,
        totalAmount: 500,
        idempotencyKey: randomUUID(),
        payments: { create: [{ method: 'CASH', amount: 500 }] },
      },
    });
    await prisma.refund.create({
      data: {
        saleId: sale.id,
        tenantId,
        branchId,
        amount: 100,
        processedByUserId: userId,
        shiftId,
        idempotencyKey: randomUUID(),
      },
    });
    await as(token)
      .post(`/shifts/${shiftId}/cash-movements`, { type: 'CASH_IN', amount: 300 })
      .expect(201);
    await as(token)
      .post(`/shifts/${shiftId}/cash-movements`, { type: 'CASH_OUT', amount: 50 })
      .expect(201);

    // expected = 1000 (float) + 500 (cash sale) + 300 (cash-in) - 50 (cash-out) - 100 (refund) = 1650
    const res = await as(token).post(`/shifts/${shiftId}/close`, { closingCash: 1650 }).expect(201);
    expect(Number(res.body.expectedCash)).toBe(1650);
    expect(Number(res.body.variance)).toBe(0);
    expect(res.body.status).toBe('CLOSED');
  });

  it('close reports a non-zero variance when counted cash differs from expected', async () => {
    const opened = await as(token).post('/shifts', { branchId, openingFloat: 1000 }).expect(201);

    const res = await as(token)
      .post(`/shifts/${opened.body.id}/close`, { closingCash: 950 })
      .expect(201);
    expect(Number(res.body.expectedCash)).toBe(1000);
    expect(Number(res.body.variance)).toBe(-50);
  });

  it('rejects closing an already-closed shift', async () => {
    const opened = await as(token).post('/shifts', { branchId, openingFloat: 1000 }).expect(201);
    await as(token).post(`/shifts/${opened.body.id}/close`, { closingCash: 1000 }).expect(201);
    await as(token).post(`/shifts/${opened.body.id}/close`, { closingCash: 1000 }).expect(409);
  });
});
