import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { asDuration, parseDurationMs } from '../common/utils/duration.util';
import { PasswordService } from './password.service';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { AccessTokenPayload, RefreshTokenPayload } from './interfaces/token-payload.interface';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

type UserWithAccess = {
  id: string;
  tenantId: string | null;
  passwordHash: string;
  isActive: boolean;
  userRoles: { role: { name: string; rolePermissions: { permission: { code: string } }[] } }[];
  userBranches: { branchId: string }[];
};

const USER_WITH_ACCESS_INCLUDE = {
  userRoles: {
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      },
    },
  },
  userBranches: true,
} as const;

function toAccessClaims(user: UserWithAccess) {
  const roles = user.userRoles.map((userRole) => userRole.role.name);
  const permissions = Array.from(
    new Set(
      user.userRoles.flatMap((userRole) =>
        userRole.role.rolePermissions.map((rolePermission) => rolePermission.permission.code),
      ),
    ),
  );
  const branchIds = user.userBranches.map((userBranch) => userBranch.branchId);
  return { roles, permissions, branchIds };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { tenantId: dto.tenantId ?? null, email: dto.email },
      include: USER_WITH_ACCESS_INCLUDE,
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await this.passwordService.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    const payload = this.verifyRefreshToken(refreshToken);
    const tokenHash = hashToken(refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revoked) {
      // Reuse of an already-rotated token: treat as potential theft and kill the whole chain.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId },
        data: { revoked: true },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: USER_WITH_ACCESS_INCLUDE,
    });
    if (!user || !user.isActive) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId },
        data: { revoked: true },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const issued = this.buildTokens(user, payload.familyId);

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revoked: true, replacedByTokenHash: issued.refreshTokenHash },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: issued.refreshTokenHash,
          familyId: payload.familyId,
          expiresAt: issued.refreshExpiresAt,
        },
      }),
    ]);

    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      expiresIn: issued.expiresIn,
    };
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, userId, revoked: false },
      data: { revoked: true },
    });
  }

  async getCurrentUser(authenticatedUser: AuthenticatedUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: authenticatedUser.userId },
      select: {
        id: true,
        tenantId: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    });

    return {
      ...user,
      roles: authenticatedUser.roles,
      permissions: authenticatedUser.permissions,
      branchIds: authenticatedUser.branchIds,
    };
  }

  private async issueTokens(user: UserWithAccess): Promise<AuthResponseDto> {
    const familyId = randomUUID();
    const issued = this.buildTokens(user, familyId);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: issued.refreshTokenHash,
        familyId,
        expiresAt: issued.refreshExpiresAt,
      },
    });

    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      expiresIn: issued.expiresIn,
    };
  }

  private buildTokens(user: UserWithAccess, familyId: string) {
    const { roles, permissions, branchIds } = toAccessClaims(user);
    const accessExpiresIn = asDuration(
      this.configService.getOrThrow<string>('jwt.accessExpiresIn'),
    );
    const refreshExpiresIn = asDuration(
      this.configService.getOrThrow<string>('jwt.refreshExpiresIn'),
    );

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      branchIds,
      roles,
      permissions,
      type: 'access',
    };
    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.configService.getOrThrow<string>('jwt.accessSecret'),
      expiresIn: accessExpiresIn,
    });

    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      familyId,
      jti: randomUUID(),
      type: 'refresh',
    };
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
      expiresIn: refreshExpiresIn,
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenHash: hashToken(refreshToken),
      expiresIn: Math.floor(parseDurationMs(accessExpiresIn) / 1000),
      refreshExpiresAt: new Date(Date.now() + parseDurationMs(refreshExpiresIn)),
    };
  }

  private verifyRefreshToken(refreshToken: string): RefreshTokenPayload {
    try {
      return this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
