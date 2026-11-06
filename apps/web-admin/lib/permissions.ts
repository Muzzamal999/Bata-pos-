import { useAuthStore } from './auth-store';

/**
 * Real permission codes, as actually enforced by each backend service's
 * @RequirePermissions decorators - not invented. One nav entry per module,
 * gated by the read permission that module's list endpoint requires.
 */
export const NAV_PERMISSIONS = {
  overview: null, // no single permission gates the overview; it degrades per-widget instead
  branches: 'branches.read',
  users: 'users.read',
  products: 'products.read',
  inventory: 'inventory.read',
  receiving: 'stock_inward.read',
  transfers: 'transfers.read',
  reports: 'reports.read',
  audit: 'audit.read',
  settings: 'roles.read',
} as const;

export function hasPermission(permissions: string[] | undefined, code: string | null): boolean {
  if (!code) return true;
  return permissions?.includes(code) ?? false;
}

export function useHasPermission(code: string | null): boolean {
  const permissions = useAuthStore((s) => s.user?.permissions);
  return hasPermission(permissions, code);
}
