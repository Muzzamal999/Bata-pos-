import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Login rate limiting (e2e)', () => {
  let app: INestApplication;
  let originalLimit: string | undefined;
  let originalTtl: string | undefined;

  beforeAll(async () => {
    // .env.test relaxes this to a high value so login can be reused freely
    // as fixture setup by every other e2e suite. Temporarily tighten it here
    // to actually exercise the guard, then restore whatever was there before
    // so this can't leak into any other test file sharing this process.
    originalLimit = process.env.THROTTLE_LOGIN_LIMIT;
    originalTtl = process.env.THROTTLE_LOGIN_TTL_MS;
    process.env.THROTTLE_LOGIN_LIMIT = '3';
    process.env.THROTTLE_LOGIN_TTL_MS = '60000';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (originalLimit === undefined) delete process.env.THROTTLE_LOGIN_LIMIT;
    else process.env.THROTTLE_LOGIN_LIMIT = originalLimit;
    if (originalTtl === undefined) delete process.env.THROTTLE_LOGIN_TTL_MS;
    else process.env.THROTTLE_LOGIN_TTL_MS = originalTtl;
  });

  it('rejects login attempts past the configured limit within the window', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'WhateverPass123' })
        .expect(401);
    }

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nonexistent@example.com', password: 'WhateverPass123' })
      .expect(429);
  });
});
