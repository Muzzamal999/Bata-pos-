import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ALL_PERMISSION_CODES } from '../src/common/constants/permissions.constant';
import { SYSTEM_ROLE_NAMES } from '../src/common/constants/system-roles.constant';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const password = 'StrongP@ssw0rd';

  let tenantA: { id: string };
  let tenantB: { id: string };
  let tenantAToken: string;
  let tenantBUserId: string;
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
    tenantA = await prisma.tenant.create({ data: { name: 'Users Test Tenant A' } });
    tenantB = await prisma.tenant.create({ data: { name: 'Users Test Tenant B' } });

    // Self-contained fixture: don't rely on `prisma db seed` having been run
    // against this database - create the permissions and an admin role here.
    for (const code of ALL_PERMISSION_CODES) {
      await prisma.permission.upsert({ where: { code }, create: { code }, update: {} });
    }
    const adminRole = await prisma.role.create({
      data: { tenantId: tenantA.id, name: 'Test Admin' },
    });
    const permissions = await prisma.permission.findMany({
      where: { code: { in: ALL_PERMISSION_CODES } },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
    });
    const cashierRole = await prisma.role.create({
      data: { tenantId: tenantA.id, name: 'Test Cashier' },
    });

    const adminUser = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: 'admin-a@example.com',
        passwordHash: await argon2.hash(password),
        firstName: 'Admin',
        lastName: 'A',
      },
    });
    await prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id } });

    const cashierUser = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: 'cashier-a@example.com',
        passwordHash: await argon2.hash(password),
        firstName: 'Cashier',
        lastName: 'A',
      },
    });
    await prisma.userRole.create({ data: { userId: cashierUser.id, roleId: cashierRole.id } });

    const tenantBUser = await prisma.user.create({
      data: {
        tenantId: tenantB.id,
        email: 'someone-b@example.com',
        passwordHash: await argon2.hash(password),
        firstName: 'Someone',
        lastName: 'B',
      },
    });
    tenantBUserId = tenantBUser.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId: tenantA.id, email: 'admin-a@example.com', password })
      .expect(201);
    tenantAToken = login.body.accessToken;

    const cashierLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId: tenantA.id, email: 'cashier-a@example.com', password })
      .expect(201);
    cashierToken = cashierLogin.body.accessToken;
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

  function authed(method: 'get' | 'post' | 'patch' | 'delete', url: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${tenantAToken}`);
  }

  function asCashier(method: 'get' | 'post' | 'patch' | 'delete', url: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${cashierToken}`);
  }

  it('rejects a Cashier (no users.* permissions) from administrative user endpoints', async () => {
    await asCashier('post', '/api/v1/users')
      .send({ email: 'blocked@example.com', password, firstName: 'No', lastName: 'Access' })
      .expect(403);
    await asCashier('get', '/api/v1/users').expect(403);
  });

  it('creates a user scoped to the caller tenant, ignoring/rejecting a mismatched tenantId', async () => {
    const res = await authed('post', '/api/v1/users')
      .send({
        tenantId: tenantB.id, // attempt to escape own tenant
        email: 'new-user@example.com',
        password,
        firstName: 'New',
        lastName: 'User',
      })
      .expect(403);

    expect(res.body.message).toMatch(/own tenant/i);
  });

  it('creates a user within the caller tenant when no tenantId is specified', async () => {
    const res = await authed('post', '/api/v1/users')
      .send({ email: 'new-user@example.com', password, firstName: 'New', lastName: 'User' })
      .expect(201);

    expect(res.body.tenantId).toBe(tenantA.id);
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('lists only users belonging to the caller tenant', async () => {
    const res = await authed('get', '/api/v1/users').expect(200);

    const emails = res.body.data.map((u: { email: string }) => u.email);
    expect(emails).toContain('admin-a@example.com');
    expect(emails).not.toContain('someone-b@example.com');
  });

  it('returns 404 (not 403) when fetching a user from another tenant', async () => {
    await authed('get', `/api/v1/users/${tenantBUserId}`).expect(404);
  });

  it('returns 404 when updating a user from another tenant', async () => {
    await authed('patch', `/api/v1/users/${tenantBUserId}`)
      .send({ firstName: 'Hacked' })
      .expect(404);
  });

  it('activates and deactivates a user within the caller tenant', async () => {
    const created = await authed('post', '/api/v1/users')
      .send({ email: 'toggle@example.com', password, firstName: 'Tog', lastName: 'Gle' })
      .expect(201);

    const deactivated = await authed('patch', `/api/v1/users/${created.body.id}/deactivate`).expect(
      200,
    );
    expect(deactivated.body.isActive).toBe(false);

    const reactivated = await authed('patch', `/api/v1/users/${created.body.id}/activate`).expect(
      200,
    );
    expect(reactivated.body.isActive).toBe(true);
  });

  it('assigns a role scoped to the caller tenant', async () => {
    const role = await prisma.role.create({ data: { tenantId: tenantA.id, name: 'Cashier A' } });
    const created = await authed('post', '/api/v1/users')
      .send({ email: 'cashier@example.com', password, firstName: 'Cash', lastName: 'Ier' })
      .expect(201);

    await authed('post', `/api/v1/users/${created.body.id}/roles`)
      .send({ roleId: role.id })
      .expect(204);

    const userRole = await prisma.userRole.findFirst({
      where: { userId: created.body.id, roleId: role.id },
    });
    expect(userRole).not.toBeNull();
  });

  it('rejects assigning a role that belongs to a different tenant', async () => {
    const roleB = await prisma.role.create({ data: { tenantId: tenantB.id, name: 'Cashier B' } });
    const created = await authed('post', '/api/v1/users')
      .send({ email: 'cashier2@example.com', password, firstName: 'Cash', lastName: 'Ier2' })
      .expect(201);

    await authed('post', `/api/v1/users/${created.body.id}/roles`)
      .send({ roleId: roleB.id })
      .expect(400);
  });

  it('assigns branch access scoped to the caller tenant and rejects a cross-tenant branch', async () => {
    const branchA = await prisma.branch.create({
      data: { tenantId: tenantA.id, name: 'Main', code: 'MAIN' },
    });
    const branchB = await prisma.branch.create({
      data: { tenantId: tenantB.id, name: 'Other', code: 'OTHER' },
    });
    const created = await authed('post', '/api/v1/users')
      .send({ email: 'stocker@example.com', password, firstName: 'Stock', lastName: 'Er' })
      .expect(201);

    await authed('post', `/api/v1/users/${created.body.id}/branches`)
      .send({ branchId: branchA.id })
      .expect(204);

    await authed('post', `/api/v1/users/${created.body.id}/branches`)
      .send({ branchId: branchB.id })
      .expect(400);
  });
});
