import { SetMetadata } from '@nestjs/common';
import { PermissionCode } from '../constants/permissions.constant';

export const PERMISSIONS_KEY = 'requiredPermissions';

/** Caller must hold ALL listed permission codes (AND semantics). */
export const RequirePermissions = (...codes: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, codes);
