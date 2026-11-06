import 'dotenv/config';
import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../src/common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../src/auth/interfaces/authenticated-user.interface';

// A throwaway protected route, only for proving the cross-service JWT
// verification pipeline works before any real business module exists.
@Controller('test-protected')
class TestProtectedController {
  @UseGuards(JwtAuthGuard)
  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}

describe('Cross-service JWT verification (e2e)', () => {
  let app: INestApplication;
  const secret = process.env.JWT_ACCESS_SECRET!;

  const claims = {
    sub: 'user-123',
    tenantId: 'tenant-abc',
    branchIds: ['branch-1'],
    roles: ['Cashier'],
    permissions: ['inventory.read'],
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestProtectedController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function sign(payload: object, overrides: jwt.SignOptions = {}) {
    return jwt.sign(payload, secret, { expiresIn: '15m', ...overrides });
  }

  it('rejects a request with no token', async () => {
    await request(app.getHttpServer()).get('/api/v1/test-protected').expect(401);
  });

  it('accepts a valid access token issued with the shared secret and exposes its claims', async () => {
    const token = sign({ ...claims, type: 'access' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/test-protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({
      userId: claims.sub,
      tenantId: claims.tenantId,
      branchIds: claims.branchIds,
      roles: claims.roles,
      permissions: claims.permissions,
    });
  });

  it('rejects a token signed with the wrong secret', async () => {
    const token = jwt.sign({ ...claims, type: 'access' }, 'wrong-secret-at-least-32-chars-long', {
      expiresIn: '15m',
    });

    await request(app.getHttpServer())
      .get('/api/v1/test-protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects an expired token', async () => {
    const token = sign({ ...claims, type: 'access' }, { expiresIn: '-1s' });

    await request(app.getHttpServer())
      .get('/api/v1/test-protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects a refresh-type token presented as an access token', async () => {
    const token = sign({ sub: claims.sub, familyId: 'f-1', jti: 'j-1', type: 'refresh' });

    await request(app.getHttpServer())
      .get('/api/v1/test-protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });
});
