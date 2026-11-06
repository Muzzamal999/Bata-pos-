import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SYSTEM_ROLE_NAMES } from '../src/common/constants/system-roles.constant';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;

  const password = 'StrongP@ssw0rd';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Auth Test Tenant' } });
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany({
      where: { OR: [{ tenantId: { not: null } }, { name: { notIn: [...SYSTEM_ROLE_NAMES] } }] },
    });
    await prisma.tenant.deleteMany();
  });

  async function createUser(overrides: { isActive?: boolean; email?: string } = {}) {
    return prisma.user.create({
      data: {
        tenantId,
        email: overrides.email ?? 'active-user@example.com',
        passwordHash: await argon2.hash(password),
        firstName: 'Test',
        lastName: 'User',
        isActive: overrides.isActive ?? true,
      },
    });
  }

  it('/api/v1/health remains public without a token', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });

  it('rejects access to a protected route without a token', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('logs in with valid credentials and returns access + refresh tokens', async () => {
    await createUser();

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: 'active-user@example.com', password })
      .expect(201);

    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();
    expect(response.body.expiresIn).toBeGreaterThan(0);
  });

  it('rejects login with the wrong password', async () => {
    await createUser();

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: 'active-user@example.com', password: 'WrongPassword1' })
      .expect(401);
  });

  it('rejects login for a deactivated user', async () => {
    await createUser({ isActive: false, email: 'deactivated@example.com' });

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: 'deactivated@example.com', password })
      .expect(401);
  });

  it('returns the authenticated user profile from /auth/me', async () => {
    await createUser();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: 'active-user@example.com', password })
      .expect(201);

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(me.body.email).toBe('active-user@example.com');
    expect(me.body.tenantId).toBe(tenantId);
  });

  it('rejects a garbage refresh token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not-a-real-token' })
      .expect(401);
  });

  it('rotates the refresh token and rejects reuse of the old one', async () => {
    await createUser();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: 'active-user@example.com', password })
      .expect(201);

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(201);

    expect(refreshed.body.accessToken).toBeDefined();
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);

    // Reusing the already-rotated (now revoked) token must fail and kill the whole family.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);

    // The token issued by the rotation above should now also be dead, since reuse revokes the family.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
  });

  it('logout revokes the refresh token so it cannot be used again', async () => {
    await createUser();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: 'active-user@example.com', password })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ refreshToken: login.body.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });
});
