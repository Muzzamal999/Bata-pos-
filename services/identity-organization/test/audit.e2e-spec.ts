import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ALL_PERMISSION_CODES } from '../src/common/constants/permissions.constant';
import { SYSTEM_ROLE_NAMES } from '../src/common/constants/system-roles.constant';

describe('Audit logging (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const password = 'StrongP@ssw0rd';
  let tenantA: { id: string };
  let adminToken: string;

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
    tenantA = await prisma.tenant.create({ data: { name: 'Audit Test Tenant A' } });

    for (const code of ALL_PERMISSION_CODES) {
      await prisma.permission.upsert({ where: { code }, create: { code }, update: {} });
    }
    const permissions = await prisma.permission.findMany({
      where: { code: { in: ALL_PERMISSION_CODES } },
    });
    const adminRole = await prisma.role.create({
      data: { tenantId: tenantA.id, name: 'Audit Full Admin A' },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
    });
    const adminUser = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: 'audit-admin-a@example.com',
        passwordHash: await argon2.hash(password),
        firstName: 'Audit',
        lastName: 'AdminA',
      },
    });
    await prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id } });

    adminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId: tenantA.id, email: 'audit-admin-a@example.com', password })
        .expect(201)
    ).body.accessToken;
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    // Cascades to this role's own rolePermission rows; scoped by name so the
    // permanently-seeded system roles (and their grants) are never touched.
    await prisma.role.deleteMany({
      where: { OR: [{ tenantId: { not: null } }, { name: { notIn: [...SYSTEM_ROLE_NAMES] } }] },
    });
    await prisma.tenant.deleteMany();
  });

  function authed(method: 'get' | 'post' | 'patch', url: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${adminToken}`);
  }

  it('records an audit entry when a user is created, with no password in the metadata', async () => {
    const created = await authed('post', '/api/v1/users')
      .send({ email: 'audited@example.com', password, firstName: 'Au', lastName: 'Dited' })
      .expect(201);

    // Fire-and-forget write: give the interceptor's async tap a tick to land.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'user.create', entityId: created.body.id },
    });
    expect(entry).not.toBeNull();
    expect(entry?.tenantId).toBe(tenantA.id);
    const metadata = entry?.metadata as { body?: Record<string, unknown> };
    expect(metadata.body?.password).toBeUndefined();
    expect(metadata.body?.email).toBe('audited@example.com');
  });

  it('does not record an audit entry for a plain read', async () => {
    await authed('get', '/api/v1/users').expect(200);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const count = await prisma.auditLog.count();
    expect(count).toBe(0);
  });

  it('records the acting user as the actor', async () => {
    const created = await authed('post', '/api/v1/users')
      .send({ email: 'audited2@example.com', password, firstName: 'Au', lastName: 'Dited2' })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'user.create', entityId: created.body.id },
    });
    const admin = await prisma.user.findFirstOrThrow({
      where: { email: 'audit-admin-a@example.com' },
    });
    expect(entry?.actorUserId).toBe(admin.id);
  });
});
