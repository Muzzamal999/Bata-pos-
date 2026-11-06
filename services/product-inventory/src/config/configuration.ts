export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3002', 10),

  database: {
    url: process.env.DATABASE_URL,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
  },

  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? 'amqp://bata:bata_pass@localhost:5672',
    exchange: process.env.RABBITMQ_EXCHANGE ?? 'product_inventory.events',
    outboxRelayEnabled: (process.env.OUTBOX_RELAY_ENABLED ?? 'true') === 'true',
  },
});
