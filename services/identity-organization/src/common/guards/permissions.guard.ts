import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../constants/permissions.constant';

/**
 * Runs after JwtAuthGuard. A route with no @RequirePermissions metadata is
 * untouched by this guard - authentication alone is sufficient for it.
 * A superuser role doesn't get special-cased here: Platform Super Admin is
 * seeded with every permission code, so it naturally passes any check.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionCode[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest().user as AuthenticatedUser | undefined;
    const granted = new Set(user?.permissions ?? []);
    const hasAll = required.every((code) => granted.has(code));

    if (!hasAll) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
