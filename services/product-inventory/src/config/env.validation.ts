import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3002),

  DATABASE_URL: Joi.string().uri().required(),

  // Must match the identity-organization service's JWT_ACCESS_SECRET exactly —
  // this service verifies tokens it did not issue, it never issues its own.
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),

  RABBITMQ_URL: Joi.string().uri().default('amqp://bata:bata_pass@localhost:5672'),
  RABBITMQ_EXCHANGE: Joi.string().default('product_inventory.events'),
  OUTBOX_RELAY_ENABLED: Joi.boolean().default(true),
});
