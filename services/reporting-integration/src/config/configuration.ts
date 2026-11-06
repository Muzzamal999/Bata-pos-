export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3003', 10),

  database: {
    url: process.env.DATABASE_URL,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
  },

  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? 'amqp://bata:bata_pass@localhost:5672',
    productInventoryExchange: process.env.PRODUCT_INVENTORY_EXCHANGE ?? 'product_inventory.events',
    salesPosExchange: process.env.SALES_POS_EXCHANGE ?? 'sales_pos.events',
    consumerEnabled: (process.env.EVENT_CONSUMER_ENABLED ?? 'true') === 'true',
  },
});
