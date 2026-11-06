/**
 * Mirrors the JWT claim shape issued by the identity-organization service.
 * This service never issues tokens itself - it only verifies and trusts them.
 */
export interface AuthenticatedUser {
  userId: string;
  tenantId: string | null;
  branchIds: string[];
  roles: string[];
  permissions: string[];
}
