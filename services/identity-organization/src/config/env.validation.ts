import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().uri().required(),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // Relaxed in .env.test, which is loaded on top of .env when NODE_ENV=test,
  // since login is called heavily as e2e test setup and would otherwise trip
  // the production-strength limit within a single test run.
  THROTTLE_LOGIN_LIMIT: Joi.number().default(5),
  THROTTLE_LOGIN_TTL_MS: Joi.number().default(60_000),
});
