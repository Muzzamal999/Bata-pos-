import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ALL_PERMISSION_CODES } from '../src/common/constants/permissions.constant';
import { SYSTEM_ROLE_NAMES } from '../src/common/constants/system-roles.constant';

describe('Tenants (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const password = 'StrongP@ssw0rd';

  let tenantA: { id: string };
  let tenantB: { id: string };
  let tenantAAdminToken: string;
  let platformAdminToken: string;
  let cashierToken: string;

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

  beforeEach(async () => {
    tenantA = await prisma.tenant.create({ data: { name: 'Tenants Test Tenant A' } });
    tenantB = await prisma.tenant.create({ data: { name: 'Tenants Test Tenant B' } });

    for (const code of ALL_PERMISSION_CODES) {
      await prisma.permission.upsert({ where: { code }, create: { code }, update: {} });
    }
    const permissions = await prisma.permission.findMany({
      where: { code: { in: ALL_PERMISSION_CODES } },
    });

    // Tenant-scoped "admin" holding every permission, including tenants.* -
    // used to prove the platform-only check is enforced in the service layer,
    // not just by permission absence.
    const tenantAdminRole = await prisma.role.create({
      data: { tenantId: tenantA.id, name: 'Tenants Full Admin A' },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: tenantAdminRole.id, permissionId: p.id })),
    });
    const tenantAdminUser = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: 'tenants-admin-a@example.com',
        passwordHash: await argon2.hash(password),
        firstName: 'Tenants',
        lastName: 'AdminA',
      },
    });
    await prisma.userRole.create({
      data: { userId: tenantAdminUser.id, roleId: tenantAdminRole.id },
    });

    const platformAdminRole = await prisma.role.create({
      data: { tenantId: null, name: 'Tenants Full Platform Admin' },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: platformAdminRole.id, permissionId: p.id })),
    });
    const platformAdminUser = await prisma.user.create({
      data: {
        tenantId: null,
        email: 'tenants-platform-admin@example.com',
        passwordHash: await argon2.hash(password),
        firstName: 'Platform',
        lastName: 'Admin',
      },
    });
    await prisma.userRole.create({
      data: { userId: platformAdminUser.id, roleId: platformAdminRole.id },
    });

    const cashierRole = await prisma.role.create({
      data: { tenantId: tenantA.id, name: 'Tenants Test Cashier' },
    });
    const cashierUser = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: 'tenants-cashier-a@example.com',
        passwordHash: await argon2.hash(password),
        firstName: 'Cashier',
        lastName: 'A',
      },
    });
    await prisma.userRole.create({ data: { userId: cashierUser.id, roleId: cashierRole.id } });

    tenantAAdminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId: tenantA.id, email: 'tenants-admin-a@example.com', password })
        .expect(201)
    ).body.accessToken;

    platformAdminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'tenants-platform-admin@example.com', password })
        .expect(201)
    ).body.accessToken;

    cashierToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId: tenantA.id, email: 'tenants-cashier-a@example.com', password })
        .expect(201)
    ).body.accessToken;
  });

  afterEach(async () => {
    await prisma.userRole.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany({
      where: { OR: [{ tenantId: { not: null } }, { name: { notIn: [...SYSTEM_ROLE_NAMES] } }] },
    });
    await prisma.tenant.deleteMany();
  });

  function as(token: string, method: 'get' | 'post' | 'patch', url: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  }

  it('rejects an unprivileged caller from every tenants endpoint', async () => {
    await as(cashierToken, 'post', '/api/v1/tenants').send({ name: 'x' }).expect(403);
    await as(cashierToken, 'get', '/api/v1/tenants').expect(403);
    await as(cashierToken, 'get', `/api/v1/tenants/${tenantA.id}`).expect(403);
  });

  it('allows a platform-level caller to create a tenant', async () => {
    const res = await as(platformAdminToken, 'post', '/api/v1/tenants')
      .send({ name: 'New Retail Co' })
      .expect(201);
    expect(res.body.name).toBe('New Retail Co');
    expect(res.body.isActive).toBe(true);

    await prisma.tenant.delete({ where: { id: res.body.id } });
  });

  it('blocks a tenant-scoped caller from creating a tenant even with tenants.create granted', async () => {
    const res = await as(tenantAAdminToken, 'post', '/api/v1/tenants')
      .send({ name: 'Should Not Exist' })
      .expect(403);
    expect(res.body.message).toMatch(/platform-level/i);
  });

  it('lists only the caller own tenant for a tenant-scoped caller', async () => {
    const res = await as(tenantAAdminToken, 'get', '/api/v1/tenants').expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(tenantA.id);
  });

  it('lists every tenant for a platform-level caller', async () => {
    const res = await as(platformAdminToken, 'get', '/api/v1/tenants').expect(200);
    const ids = res.body.data.map((t: { id: string }) => t.id);
    expect(ids).toContain(tenantA.id);
    expect(ids).toContain(tenantB.id);
  });

  it('returns 404 (not 403) when a tenant-scoped caller fetches another tenant', async () => {
    await as(tenantAAdminToken, 'get', `/api/v1/tenants/${tenantB.id}`).expect(404);
  });

  it('allows a tenant-scoped caller to update their own tenant, and 404s on another', async () => {
    const updated = await as(tenantAAdminToken, 'patch', `/api/v1/tenants/${tenantA.id}`)
      .send({ name: 'Renamed Tenant A' })
      .expect(200);
    expect(updated.body.name).toBe('Renamed Tenant A');

    await as(tenantAAdminToken, 'patch', `/api/v1/tenants/${tenantB.id}`)
      .send({ name: 'Hijack Attempt' })
      .expect(404);
  });

  it('blocks a tenant-scoped caller from activating/deactivating even their own tenant', async () => {
    await as(tenantAAdminToken, 'patch', `/api/v1/tenants/${tenantA.id}/deactivate`).expect(403);
    await as(tenantAAdminToken, 'patch', `/api/v1/tenants/${tenantA.id}/activate`).expect(403);
  });

  it('allows a platform-level caller to deactivate and reactivate any tenant', async () => {
    const deactivated = await as(
      platformAdminToken,
      'patch',
      `/api/v1/tenants/${tenantB.id}/deactivate`,
    ).expect(200);
    expect(deactivated.body.isActive).toBe(false);

    const reactivated = await as(
      platformAdminToken,
      'patch',
      `/api/v1/tenants/${tenantB.id}/activate`,
    ).expect(200);
    expect(reactivated.body.isActive).toBe(true);
  });
});
