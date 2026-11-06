/**
 * Fixed catalog of permission codes this service enforces. These are opaque
 * strings as far as identity-organization is concerned - that service's
 * Permissions API stores whatever codes an admin creates; it doesn't need to
 * know about this list in advance. This service only ever checks whether a
 * code is present in the caller's JWT claims; it never stores or manages
 * permissions itself.
 */
export const PERMISSIONS = {
  SALES_CREATE: 'sales.create',
  SALES_READ: 'sales.read',
  SALES_REFUND: 'sales.refund',
  SALES_VOID: 'sales.void',
  SHIFTS_OPEN: 'shifts.open',
  SHIFTS_CLOSE: 'shifts.close',
  SHIFTS_READ: 'shifts.read',
  CATALOG_READ: 'catalog.read',
  CATALOG_SYNC: 'catalog.sync',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
