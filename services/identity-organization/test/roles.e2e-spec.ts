import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ALL_PERMISSION_CODES } from '../src/common/constants/permissions.constant';
import { SYSTEM_ROLE_NAMES } from '../src/common/constants/system-roles.constant';

describe('Roles & Permissions (e2e)', () => {
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
    tenantA = await prisma.tenant.create({ data: { name: 'Roles Test Tenant A' } });
    tenantB = await prisma.tenant.create({ data: { name: 'Roles Test Tenant B' } });

    for (const code of ALL_PERMISSION_CODES) {
      await prisma.permission.upsert({ where: { code }, create: { code }, update: {} });
    }
    const permissions = await prisma.permission.findMany({
      where: { code: { in: ALL_PERMISSION_CODES } },
    });

    // Tenant-scoped admin: full permissions, scoped to tenantA.
    const tenantAdminRole = await prisma.role.create({
      data: { tenantId: tenantA.id, name: 'Full Admin A' },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: tenantAdminRole.id, permissionId: p.id })),
    });
    const tenantAdminUser = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: 'roles-admin-a@example.com',
        passwordHash: await argon2.hash(password),
        firstName: 'Roles',
        lastName: 'AdminA',
      },
    });
    await prisma.userRole.create({
      data: { userId: tenantAdminUser.id, roleId: tenantAdminRole.id },
    });

    // Platform-level admin: full permissions, tenantId null.
    const platformAdminRole = await prisma.role.create({
      data: { tenantId: null, name: 'Full Platform Admin' },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: platformAdminRole.id, permissionId: p.id })),
    });
    const platformAdminUser = await prisma.user.create({
      data: {
        tenantId: null,
        email: 'roles-platform-admin@example.com',
        passwordHash: await argon2.hash(password),
        firstName: 'Platform',
        lastName: 'Admin',
      },
    });
    await prisma.userRole.create({
      data: { userId: platformAdminUser.id, roleId: platformAdminRole.id },
    });

    // Unprivileged cashier in tenantA.
    const cashierRole = await prisma.role.create({
      data: { tenantId: tenantA.id, name: 'Roles Test Cashier' },
    });
    const cashierUser = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: 'roles-cashier-a@example.com',
        passwordHash: await argon2.hash(password),
        firstName: 'Cashier',
        lastName: 'A',
      },
    });
    await prisma.userRole.create({ data: { userId: cashierUser.id, roleId: cashierRole.id } });

    tenantAAdminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId: tenantA.id, email: 'roles-admin-a@example.com', password })
        .expect(201)
    ).body.accessToken;

    platformAdminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'roles-platform-admin@example.com', password })
        .expect(201)
    ).body.accessToken;

    cashierToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId: tenantA.id, email: 'roles-cashier-a@example.com', password })
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
    // The "Permissions" describe block below creates its own throwaway
    // permission codes - remove those, but never touch the seeded catalog.
    await prisma.permission.deleteMany({ where: { code: { notIn: [...ALL_PERMISSION_CODES] } } });
    await prisma.tenant.deleteMany();
  });

  function as(token: string, method: 'get' | 'post' | 'patch' | 'delete', url: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  }

  describe('Roles', () => {
    it('rejects an unprivileged caller from every roles endpoint', async () => {
      await as(cashierToken, 'post', '/api/v1/roles').send({ name: 'x' }).expect(403);
      await as(cashierToken, 'get', '/api/v1/roles').expect(403);
    });

    it('creates a role scoped to the caller tenant and rejects a mismatched tenantId', async () => {
      await as(tenantAAdminToken, 'post', '/api/v1/roles')
        .send({ tenantId: tenantB.id, name: 'Escape Attempt' })
        .expect(403);

      const res = await as(tenantAAdminToken, 'post', '/api/v1/roles')
        .send({ name: 'Regional Supervisor' })
        .expect(201);
      expect(res.body.tenantId).toBe(tenantA.id);
      expect(res.body.isSystem).toBe(false);
    });

    it('lists the caller tenant roles plus global roles, but not another tenant roles', async () => {
      await prisma.role.create({ data: { tenantId: tenantB.id, name: 'Tenant B Only Role' } });
      const globalRole = await prisma.role.create({
        data: { tenantId: null, name: 'Visible Global Role', isSystem: true },
      });

      const res = await as(tenantAAdminToken, 'get', '/api/v1/roles').expect(200);
      const names = res.body.data.map((r: { name: string }) => r.name);
      expect(names).not.toContain('Tenant B Only Role');
      expect(names).toContain('Visible Global Role');

      await prisma.role.delete({ where: { id: globalRole.id } });
    });

    it('returns 404 (not 403) fetching a role from another tenant', async () => {
      const roleB = await prisma.role.create({ data: { tenantId: tenantB.id, name: 'B Role' } });
      await as(tenantAAdminToken, 'get', `/api/v1/roles/${roleB.id}`).expect(404);
    });

    it('blocks updating and deleting a system role', async () => {
      const systemRole = await prisma.role.create({
        data: { tenantId: null, name: 'Seeded System Role', isSystem: true },
      });

      await as(platformAdminToken, 'patch', `/api/v1/roles/${systemRole.id}`)
        .send({ name: 'Renamed' })
        .expect(400);
      await as(platformAdminToken, 'delete', `/api/v1/roles/${systemRole.id}`).expect(400);
    });

    it('blocks a tenant-scoped caller from modifying a global (non-system) role', async () => {
      const globalRole = await prisma.role.create({
        data: { tenantId: null, name: 'Global Custom Role' },
      });

      await as(tenantAAdminToken, 'patch', `/api/v1/roles/${globalRole.id}`)
        .send({ name: 'Hijacked' })
        .expect(403);
    });

    it('allows a platform-level caller to modify and delete a non-system global role', async () => {
      const globalRole = await prisma.role.create({
        data: { tenantId: null, name: 'Global Editable Role' },
      });

      await as(platformAdminToken, 'patch', `/api/v1/roles/${globalRole.id}`)
        .send({ description: 'updated' })
        .expect(200);
      await as(platformAdminToken, 'delete', `/api/v1/roles/${globalRole.id}`).expect(204);
    });

    it('assigns and removes a permission on a role within the caller tenant', async () => {
      const role = await as(tenantAAdminToken, 'post', '/api/v1/roles')
        .send({ name: 'Perm Target Role' })
        .then((r) => r.body);
      const permission = await prisma.permission.findFirstOrThrow({
        where: { code: ALL_PERMISSION_CODES[0] },
      });

      await as(tenantAAdminToken, 'post', `/api/v1/roles/${role.id}/permissions`)
        .send({ permissionId: permission.id })
        .expect(204);

      const assigned = await prisma.rolePermission.findFirst({
        where: { roleId: role.id, permissionId: permission.id },
      });
      expect(assigned).not.toBeNull();

      await as(
        tenantAAdminToken,
        'delete',
        `/api/v1/roles/${role.id}/permissions/${permission.id}`,
      ).expect(204);

      const removed = await prisma.rolePermission.findFirst({
        where: { roleId: role.id, permissionId: permission.id },
      });
      expect(removed).toBeNull();
    });

    it('returns 404 when assigning a permission to a role from another tenant', async () => {
      const roleB = await prisma.role.create({ data: { tenantId: tenantB.id, name: 'B Role 2' } });
      const permission = await prisma.permission.findFirstOrThrow({
        where: { code: ALL_PERMISSION_CODES[0] },
      });

      await as(tenantAAdminToken, 'post', `/api/v1/roles/${roleB.id}/permissions`)
        .send({ permissionId: permission.id })
        .expect(404);
    });
  });

  describe('Permissions', () => {
    it('rejects an unprivileged caller', async () => {
      await as(cashierToken, 'get', '/api/v1/permissions').expect(403);
    });

    it('creates, lists, fetches and updates a permission', async () => {
      const created = await as(tenantAAdminToken, 'post', '/api/v1/permissions')
        .send({ code: 'reports.export', description: 'Export reports' })
        .expect(201);

      await as(tenantAAdminToken, 'post', '/api/v1/permissions')
        .send({ code: 'reports.export' })
        .expect(409);

      const list = await as(tenantAAdminToken, 'get', '/api/v1/permissions').expect(200);
      expect(list.body.data.some((p: { code: string }) => p.code === 'reports.export')).toBe(true);

      await as(tenantAAdminToken, 'get', `/api/v1/permissions/${created.body.id}`).expect(200);

      const updated = await as(tenantAAdminToken, 'patch', `/api/v1/permissions/${created.body.id}`)
        .send({ description: 'Updated description' })
        .expect(200);
      expect(updated.body.description).toBe('Updated description');
    });

    it('rejects an invalid permission code format', async () => {
      await as(tenantAAdminToken, 'post', '/api/v1/permissions')
        .send({ code: 'NotAValidCode' })
        .expect(400);
    });
  });
});
