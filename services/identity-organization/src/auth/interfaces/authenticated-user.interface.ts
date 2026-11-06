export interface AuthenticatedUser {
  userId: string;
  tenantId: string | null;
  branchIds: string[];
  roles: string[];
  permissions: string[];
}
