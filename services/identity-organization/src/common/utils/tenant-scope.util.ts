import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

/**
 * Resolves the tenant a request should operate in, using the caller's own
 * JWT claim as the source of truth rather than trusting client input directly.
 * - Tenant-scoped callers are pinned to their own tenant; a mismatched explicit
 *   tenantId in the request is rejected outright instead of silently overridden.
 * - Platform-level callers (tenantId === null) may act on any tenant, or omit
 *   one to operate platform-wide.
 */
export function resolveTenantScope(
  caller: AuthenticatedUser,
  requestedTenantId?: string | null,
): string | null {
  if (caller.tenantId !== null) {
    if (requestedTenantId && requestedTenantId !== caller.tenantId) {
      throw new ForbiddenException('Cannot act outside your own tenant');
    }
    return caller.tenantId;
  }
  return requestedTenantId ?? null;
}

/**
 * Guards access to a specific already-loaded resource. Uses 404 (not 403) on
 * a cross-tenant mismatch so callers can't distinguish "not found" from
 * "exists in another tenant" and enumerate IDs outside their own tenant.
 */
export function assertTenantAccess(
  caller: AuthenticatedUser,
  resourceTenantId: string | null,
): void {
  if (caller.tenantId !== null && resourceTenantId !== caller.tenantId) {
    throw new NotFoundException();
  }
}
