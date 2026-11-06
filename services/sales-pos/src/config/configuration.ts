export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3004', 10),

  database: {
    url: process.env.DATABASE_URL,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
  },

  productInventory: {
    baseUrl: process.env.PRODUCT_INVENTORY_BASE_URL ?? 'http://localhost:3002/api/v1',
  },

  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? 'amqp://bata:bata_pass@localhost:5672',
    salesPosExchange: process.env.SALES_POS_EXCHANGE ?? 'sales_pos.events',
    productInventoryExchange: process.env.PRODUCT_INVENTORY_EXCHANGE ?? 'product_inventory.events',
    consumerEnabled: (process.env.EVENT_CONSUMER_ENABLED ?? 'true') === 'true',
    relayEnabled: (process.env.OUTBOX_RELAY_ENABLED ?? 'true') === 'true',
  },
});
