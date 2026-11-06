export interface AccessTokenPayload {
  sub: string;
  tenantId: string | null;
  branchIds: string[];
  roles: string[];
  permissions: string[];
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  familyId: string;
  jti: string;
  type: 'refresh';
}
