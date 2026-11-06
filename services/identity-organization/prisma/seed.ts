import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { ALL_PERMISSION_CODES, PERMISSIONS } from '../src/common/constants/permissions.constant';
import { SYSTEM_ROLE_NAMES } from '../src/common/constants/system-roles.constant';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const SYSTEM_ROLES: { name: string; description: string; permissions: string[] }[] = [
  {
    name: SYSTEM_ROLE_NAMES[0], // 'Platform Super Admin'
    description: 'Cross-tenant platform operator. Holds every permission.',
    permissions: ALL_PERMISSION_CODES,
  },
  {
    name: SYSTEM_ROLE_NAMES[1], // 'Tenant Admin'
    description: 'Full administrative control within a single tenant.',
    permissions: [
      PERMISSIONS.USERS_CREATE,
      PERMISSIONS.USERS_READ,
      PERMISSIONS.USERS_UPDATE,
      PERMISSIONS.USERS_ACTIVATE,
      PERMISSIONS.USERS_DEACTIVATE,
      PERMISSIONS.USERS_ASSIGN_ROLE,
      PERMISSIONS.USERS_ASSIGN_BRANCH,
      PERMISSIONS.ROLES_CREATE,
      PERMISSIONS.ROLES_READ,
      PERMISSIONS.ROLES_UPDATE,
      PERMISSIONS.ROLES_DELETE,
      PERMISSIONS.ROLES_ASSIGN_PERMISSION,
      PERMISSIONS.PERMISSIONS_READ,
      PERMISSIONS.TENANTS_READ,
      PERMISSIONS.TENANTS_UPDATE,
      PERMISSIONS.BRANCHES_CREATE,
      PERMISSIONS.BRANCHES_READ,
      PERMISSIONS.BRANCHES_UPDATE,
      PERMISSIONS.BRANCHES_ACTIVATE,
      PERMISSIONS.BRANCHES_DEACTIVATE,
    ],
  },
  {
    name: SYSTEM_ROLE_NAMES[2], // 'Head Office Manager'
    description: 'Broad visibility across users, roles, tenant and branch info, no mutation rights.',
    permissions: [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.ROLES_READ,
      PERMISSIONS.PERMISSIONS_READ,
      PERMISSIONS.TENANTS_READ,
      PERMISSIONS.BRANCHES_READ,
    ],
  },
  {
    name: SYSTEM_ROLE_NAMES[3], // 'Branch Manager'
    description: 'Manages their own branch information; stock operations live in Service 2.',
    permissions: [PERMISSIONS.USERS_READ, PERMISSIONS.BRANCHES_READ, PERMISSIONS.BRANCHES_UPDATE],
  },
  {
    name: SYSTEM_ROLE_NAMES[4], // 'Cashier'
    description: 'Point-of-sale operator. No Identity & Organization administrative permissions.',
    permissions: [],
  },
  {
    name: SYSTEM_ROLE_NAMES[5], // 'Stock Manager'
    description: 'Inventory operator. No Identity & Organization administrative permissions.',
    permissions: [],
  },
];

async function main() {
  console.log('Seeding permission catalog...');
  for (const code of ALL_PERMISSION_CODES) {
    await prisma.permission.upsert({
      where: { code },
      create: { code, description: code },
      update: {},
    });
  }

  console.log('Seeding system roles...');
  for (const roleDef of SYSTEM_ROLES) {
    // tenantId is null for every system role, and Prisma's compound-unique
    // shorthand doesn't accept null (SQL NULL never equals NULL in a plain
    // unique lookup) - our real protection for this case is the hand-written
    // partial unique index from the Phase 4 migration, not this constraint.
    const existing = await prisma.role.findFirst({
      where: { tenantId: null, name: roleDef.name },
    });
    const role = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: { description: roleDef.description, isSystem: true },
        })
      : await prisma.role.create({
          data: {
            tenantId: null,
            name: roleDef.name,
            description: roleDef.description,
            isSystem: true,
          },
        });

    for (const code of roleDef.permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { code } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
