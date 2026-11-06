/**
 * Fixed catalog of permission codes this service enforces. These are opaque
 * strings as far as identity-organization is concerned - that service is the
 * single source of truth for which codes exist and which roles grant them.
 * This service only ever checks whether a code is present in the caller's
 * JWT claims; it never stores or manages permissions itself.
 */
export const PERMISSIONS = {
  REPORTS_READ: 'reports.read',
  ANALYTICS_READ: 'analytics.read',
  AUDIT_READ: 'audit.read',
  INTEGRATION_READ: 'integration.read',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
