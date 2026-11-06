/**
 * Fixed catalog of permission codes. Scoped strictly to the modules that
 * actually enforce them - do not add a code here until a real guard checks
 * it, otherwise the catalog implies protection that doesn't exist.
 */
export const PERMISSIONS = {
  USERS_CREATE: 'users.create',
  USERS_READ: 'users.read',
  USERS_UPDATE: 'users.update',
  USERS_ACTIVATE: 'users.activate',
  USERS_DEACTIVATE: 'users.deactivate',
  USERS_ASSIGN_ROLE: 'users.assign_role',
  USERS_ASSIGN_BRANCH: 'users.assign_branch',

  ROLES_CREATE: 'roles.create',
  ROLES_READ: 'roles.read',
  ROLES_UPDATE: 'roles.update',
  ROLES_DELETE: 'roles.delete',
  ROLES_ASSIGN_PERMISSION: 'roles.assign_permission',

  PERMISSIONS_CREATE: 'permissions.create',
  PERMISSIONS_READ: 'permissions.read',
  PERMISSIONS_UPDATE: 'permissions.update',

  TENANTS_CREATE: 'tenants.create',
  TENANTS_READ: 'tenants.read',
  TENANTS_UPDATE: 'tenants.update',
  TENANTS_ACTIVATE: 'tenants.activate',
  TENANTS_DEACTIVATE: 'tenants.deactivate',

  BRANCHES_CREATE: 'branches.create',
  BRANCHES_READ: 'branches.read',
  BRANCHES_UPDATE: 'branches.update',
  BRANCHES_ACTIVATE: 'branches.activate',
  BRANCHES_DEACTIVATE: 'branches.deactivate',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_CODES: PermissionCode[] = Object.values(PERMISSIONS);
