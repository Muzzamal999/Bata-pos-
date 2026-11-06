import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ALL_PERMISSION_CODES } from '../src/common/constants/permissions.constant';
import { SYSTEM_ROLE_NAMES } from '../src/common/constants/system-roles.constant';

describe('Branches (e2e)', () => {
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
    tenantA = await prisma.tenant.create({ data: { name: 'Branches Test Tenant A' } });
    tenantB = await prisma.tenant.create({ data: { name: 'Branches Test Tenant B' } });

    for (const code of ALL_PERMISSION_CODES) {
      await prisma.permission.upsert({ where: { code }, create: { code }, update: {} });
    }
    const permissions = await prisma.permission.findMany({
      where: { code: { in: ALL_PERMISSION_CODES } },
    });

    const tenantAdminRole = await prisma.role.create({
      data: { tenantId: tenantA.id, name: 'Branches Full Admin A' },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: tenantAdminRole.id, permissionId: p.id })),
    });
    const tenantAdminUser = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: 'branches-admin-a@example.com',
        passwordHash: await argon2.hash(password),
        firstName: 'Branches',
        lastName: 'AdminA',
      },
    });
    await prisma.userRole.create({
      data: { userId: tenantAdminUser.id, roleId: tenantAdminRole.id },
    });

    const platformAdminRole = await prisma.role.create({
      data: { tenantId: null, name: 'Branches Full Platform Admin' },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: platformAdminRole.id, permissionId: p.id })),
    });
    const platformAdminUser = await prisma.user.create({
      data: {
        tenantId: null,
        email: 'branches-platform-admin@example.com',
        passwordHash: await argon2.hash(password),
        firstName: 'Platform',
        lastName: 'Admin',
      },
    });
    await prisma.userRole.create({
      data: { userId: platformAdminUser.id, roleId: platformAdminRole.id },
    });

    const cashierRole = await prisma.role.create({
      data: { tenantId: tenantA.id, name: 'Branches Test Cashier' },
    });
    const cashierUser = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: 'branches-cashier-a@example.com',
        passwordHash: await argon2.hash(password),
        firstName: 'Cashier',
        lastName: 'A',
      },
    });
    await prisma.userRole.create({ data: { userId: cashierUser.id, roleId: cashierRole.id } });

    tenantAAdminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId: tenantA.id, email: 'branches-admin-a@example.com', password })
        .expect(201)
    ).body.accessToken;

    platformAdminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'branches-platform-admin@example.com', password })
        .expect(201)
    ).body.accessToken;

    cashierToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId: tenantA.id, email: 'branches-cashier-a@example.com', password })
        .expect(201)
    ).body.accessToken;
  });

  afterEach(async () => {
    await prisma.userBranch.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany({
      where: { OR: [{ tenantId: { not: null } }, { name: { notIn: [...SYSTEM_ROLE_NAMES] } }] },
    });
    await prisma.branch.deleteMany();
    await prisma.tenant.deleteMany();
  });

  function as(token: string, method: 'get' | 'post' | 'patch', url: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  }

  it('rejects an unprivileged caller from every branches endpoint', async () => {
    await as(cashierToken, 'post', '/api/v1/branches').send({ name: 'x', code: 'X' }).expect(403);
    await as(cashierToken, 'get', '/api/v1/branches').expect(403);
  });

  it('creates a branch scoped to the caller tenant and rejects a mismatched tenantId', async () => {
    await as(tenantAAdminToken, 'post', '/api/v1/branches')
      .send({ tenantId: tenantB.id, name: 'Escape', code: 'ESC' })
      .expect(403);

    const res = await as(tenantAAdminToken, 'post', '/api/v1/branches')
      .send({ name: 'Main Branch', code: 'MAIN' })
      .expect(201);
    expect(res.body.tenantId).toBe(tenantA.id);
    expect(res.body.isActive).toBe(true);
  });

  it('requires a platform-level caller to specify a tenantId when creating a branch', async () => {
    await as(platformAdminToken, 'post', '/api/v1/branches')
      .send({ name: 'Orphan Branch', code: 'ORPH' })
      .expect(400);

    const res = await as(platformAdminToken, 'post', '/api/v1/branches')
      .send({ tenantId: tenantA.id, name: 'Platform-created Branch', code: 'PLAT' })
      .expect(201);
    expect(res.body.tenantId).toBe(tenantA.id);
  });

  it('rejects a duplicate branch code within the same tenant', async () => {
    await as(tenantAAdminToken, 'post', '/api/v1/branches')
      .send({ name: 'Main', code: 'DUP' })
      .expect(201);
    await as(tenantAAdminToken, 'post', '/api/v1/branches')
      .send({ name: 'Secondary', code: 'DUP' })
      .expect(409);
  });

  it('lists only branches belonging to the caller tenant', async () => {
    await as(tenantAAdminToken, 'post', '/api/v1/branches')
      .send({ name: 'A Branch', code: 'ABR' })
      .expect(201);
    await prisma.branch.create({ data: { tenantId: tenantB.id, name: 'B Branch', code: 'BBR' } });

    const res = await as(tenantAAdminToken, 'get', '/api/v1/branches').expect(200);
    const codes = res.body.data.map((b: { code: string }) => b.code);
    expect(codes).toContain('ABR');
    expect(codes).not.toContain('BBR');
  });

  it('returns 404 (not 403) when fetching or updating a branch from another tenant', async () => {
    const branchB = await prisma.branch.create({
      data: { tenantId: tenantB.id, name: 'B Branch 2', code: 'BBR2' },
    });

    await as(tenantAAdminToken, 'get', `/api/v1/branches/${branchB.id}`).expect(404);
    await as(tenantAAdminToken, 'patch', `/api/v1/branches/${branchB.id}`)
      .send({ name: 'Hijacked' })
      .expect(404);
  });

  it('updates branch information and rejects renaming to a code already in use', async () => {
    const branch1 = await as(tenantAAdminToken, 'post', '/api/v1/branches')
      .send({ name: 'Branch One', code: 'ONE' })
      .expect(201)
      .then((r) => r.body);
    await as(tenantAAdminToken, 'post', '/api/v1/branches')
      .send({ name: 'Branch Two', code: 'TWO' })
      .expect(201);

    const updated = await as(tenantAAdminToken, 'patch', `/api/v1/branches/${branch1.id}`)
      .send({ address: '123 Main St' })
      .expect(200);
    expect(updated.body.address).toBe('123 Main St');

    await as(tenantAAdminToken, 'patch', `/api/v1/branches/${branch1.id}`)
      .send({ code: 'TWO' })
      .expect(409);
  });

  it('activates and deactivates a branch within the caller tenant', async () => {
    const branch = await as(tenantAAdminToken, 'post', '/api/v1/branches')
      .send({ name: 'Toggle Branch', code: 'TOG' })
      .expect(201)
      .then((r) => r.body);

    const deactivated = await as(
      tenantAAdminToken,
      'patch',
      `/api/v1/branches/${branch.id}/deactivate`,
    ).expect(200);
    expect(deactivated.body.isActive).toBe(false);

    const reactivated = await as(
      tenantAAdminToken,
      'patch',
      `/api/v1/branches/${branch.id}/activate`,
    ).expect(200);
    expect(reactivated.body.isActive).toBe(true);
  });
});
