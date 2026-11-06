/**
 * Names of the permanently-seeded system roles. Single-sourced here so the
 * seed script and test cleanup logic can't drift apart - test suites must
 * exclude these by name when wiping roles, or every e2e run destroys the
 * reference data `prisma db seed` created.
 */
export const SYSTEM_ROLE_NAMES = [
  'Platform Super Admin',
  'Tenant Admin',
  'Head Office Manager',
  'Branch Manager',
  'Cashier',
  'Stock Manager',
] as const;
