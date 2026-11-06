export interface AccessTokenPayload {
  sub: string;
  tenantId: string | null;
  branchIds: string[];
  roles: string[];
  permissions: string[];
  type: 'access';
}
