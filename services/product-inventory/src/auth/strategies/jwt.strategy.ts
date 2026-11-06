import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessTokenPayload } from '../interfaces/access-token-payload.interface';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * This service has no Users table and must not access identity-organization's
 * database directly, so unlike Service 1's own strategy, this cannot re-check
 * `isActive` against a live record. It validates the token's signature, type
 * and expiry and otherwise trusts the embedded claims. A user deactivated in
 * Service 1 remains valid here until the access token naturally expires
 * (currently 15 minutes) - an accepted tradeoff of stateless cross-service JWT
 * verification, not an oversight.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      branchIds: payload.branchIds,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
