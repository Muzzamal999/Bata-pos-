import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3004),

  DATABASE_URL: Joi.string().uri().required(),

  // Must match identity-organization's JWT_ACCESS_SECRET exactly - this
  // service verifies tokens it did not issue, it never issues its own.
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),

  PRODUCT_INVENTORY_BASE_URL: Joi.string().uri().default('http://localhost:3002/api/v1'),

  RABBITMQ_URL: Joi.string().uri().default('amqp://bata:bata_pass@localhost:5672'),
  SALES_POS_EXCHANGE: Joi.string().default('sales_pos.events'),
  PRODUCT_INVENTORY_EXCHANGE: Joi.string().default('product_inventory.events'),
  EVENT_CONSUMER_ENABLED: Joi.boolean().default(true),
  OUTBOX_RELAY_ENABLED: Joi.boolean().default(true),
});
