import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { SYSTEM_ROLE_NAMES } from '../src/common/constants/system-roles.constant';

describe('Identity schema constraints (e2e)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // This suite never creates a Permission, so that table is left untouched -
  // a blanket permission.deleteMany() here previously wiped the permanently
  // seeded catalog. Role cleanup is scoped by name for the same reason.
  afterEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.userBranch.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany({
      where: { OR: [{ tenantId: { not: null } }, { name: { notIn: [...SYSTEM_ROLE_NAMES] } }] },
    });
    await prisma.branch.deleteMany();
    await prisma.tenant.deleteMany();
  });

  it('allows the same email across two different tenants', async () => {
    const tenantA = await prisma.tenant.create({ data: { name: 'Tenant A' } });
    const tenantB = await prisma.tenant.create({ data: { name: 'Tenant B' } });

    await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: 'owner@example.com',
        passwordHash: 'hash',
        firstName: 'A',
        lastName: 'Owner',
      },
    });

    await expect(
      prisma.user.create({
        data: {
          tenantId: tenantB.id,
          email: 'owner@example.com',
          passwordHash: 'hash',
          firstName: 'B',
          lastName: 'Owner',
        },
      }),
    ).resolves.toBeDefined();
  });

  it('rejects a duplicate email within the same tenant', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Tenant C' } });
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'dup@example.com',
        passwordHash: 'hash',
        firstName: 'First',
        lastName: 'User',
      },
    });

    await expect(
      prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: 'dup@example.com',
          passwordHash: 'hash',
          firstName: 'Second',
          lastName: 'User',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate email between two platform-level (tenant-less) users', async () => {
    await prisma.user.create({
      data: {
        tenantId: null,
        email: 'super-admin@bata.com',
        passwordHash: 'hash',
        firstName: 'Super',
        lastName: 'Admin',
      },
    });

    await expect(
      prisma.user.create({
        data: {
          tenantId: null,
          email: 'super-admin@bata.com',
          passwordHash: 'hash',
          firstName: 'Another',
          lastName: 'Admin',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate branch code within the same tenant', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Tenant D' } });
    await prisma.branch.create({
      data: { tenantId: tenant.id, name: 'Main Branch', code: 'MAIN' },
    });

    await expect(
      prisma.branch.create({
        data: { tenantId: tenant.id, name: 'Duplicate Branch', code: 'MAIN' },
      }),
    ).rejects.toThrow();
  });

  it('prevents deleting a tenant that still has users (RESTRICT)', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Tenant E' } });
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'blocked@example.com',
        passwordHash: 'hash',
        firstName: 'Blocked',
        lastName: 'Delete',
      },
    });

    await expect(prisma.tenant.delete({ where: { id: tenant.id } })).rejects.toThrow();
  });

  it('cascades delete of user_roles when the user is deleted', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Tenant F' } });
    const role = await prisma.role.create({ data: { tenantId: tenant.id, name: 'Cashier' } });
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'cashier@example.com',
        passwordHash: 'hash',
        firstName: 'Cash',
        lastName: 'Ier',
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

    await prisma.user.delete({ where: { id: user.id } });

    const remaining = await prisma.userRole.findMany({ where: { roleId: role.id } });
    expect(remaining).toHaveLength(0);
  });
});
