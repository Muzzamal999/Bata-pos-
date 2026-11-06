import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

/**
 * Extracts the raw bearer token so it can be forwarded to Product &
 * Inventory's REST API - that service verifies the exact same JWT, so the
 * caller's own tenant/branch access applies there too, without a separate
 * service credential.
 */
export const Bearer = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedException();
  }
  return header.slice('Bearer '.length);
});
