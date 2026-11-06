"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("../src/generated/prisma/client");
const permissions_constant_1 = require("../src/common/constants/permissions.constant");
const prisma = new client_1.PrismaClient({
    adapter: new adapter_pg_1.PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const SYSTEM_ROLES = [
    {
        name: 'Platform Super Admin',
        description: 'Cross-tenant platform operator. Holds every permission.',
        permissions: permissions_constant_1.ALL_PERMISSION_CODES,
    },
    {
        name: 'Tenant Admin',
        description: 'Full administrative control within a single tenant.',
        permissions: [
            permissions_constant_1.PERMISSIONS.USERS_CREATE,
            permissions_constant_1.PERMISSIONS.USERS_READ,
            permissions_constant_1.PERMISSIONS.USERS_UPDATE,
            permissions_constant_1.PERMISSIONS.USERS_ACTIVATE,
            permissions_constant_1.PERMISSIONS.USERS_DEACTIVATE,
            permissions_constant_1.PERMISSIONS.USERS_ASSIGN_ROLE,
            permissions_constant_1.PERMISSIONS.USERS_ASSIGN_BRANCH,
            permissions_constant_1.PERMISSIONS.ROLES_CREATE,
            permissions_constant_1.PERMISSIONS.ROLES_READ,
            permissions_constant_1.PERMISSIONS.ROLES_UPDATE,
            permissions_constant_1.PERMISSIONS.ROLES_DELETE,
            permissions_constant_1.PERMISSIONS.ROLES_ASSIGN_PERMISSION,
            permissions_constant_1.PERMISSIONS.PERMISSIONS_READ,
        ],
    },
    {
        name: 'Head Office Manager',
        description: 'Broad visibility across users and roles, no mutation rights.',
        permissions: [permissions_constant_1.PERMISSIONS.USERS_READ, permissions_constant_1.PERMISSIONS.ROLES_READ, permissions_constant_1.PERMISSIONS.PERMISSIONS_READ],
    },
    {
        name: 'Branch Manager',
        description: 'Visibility into users; branch-scoped operational management lives in Service 2.',
        permissions: [permissions_constant_1.PERMISSIONS.USERS_READ],
    },
    {
        name: 'Cashier',
        description: 'Point-of-sale operator. No Identity & Organization administrative permissions.',
        permissions: [],
    },
    {
        name: 'Stock Manager',
        description: 'Inventory operator. No Identity & Organization administrative permissions.',
        permissions: [],
    },
];
async function main() {
    console.log('Seeding permission catalog...');
    for (const code of permissions_constant_1.ALL_PERMISSION_CODES) {
        await prisma.permission.upsert({
            where: { code },
            create: { code, description: code },
            update: {},
        });
    }
    console.log('Seeding system roles...');
    for (const roleDef of SYSTEM_ROLES) {
        const role = await prisma.role.upsert({
            where: { tenantId_name: { tenantId: null, name: roleDef.name } },
            create: {
                tenantId: null,
                name: roleDef.name,
                description: roleDef.description,
                isSystem: true,
            },
            update: { description: roleDef.description, isSystem: true },
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
//# sourceMappingURL=seed.js.map