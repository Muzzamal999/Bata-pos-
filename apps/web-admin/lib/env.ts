export const API_URLS = {
  identity: process.env.NEXT_PUBLIC_IDENTITY_API_URL ?? 'http://localhost:3001/api/v1',
  productInventory: process.env.NEXT_PUBLIC_PRODUCT_INVENTORY_API_URL ?? 'http://localhost:3002/api/v1',
  salesPos: process.env.NEXT_PUBLIC_SALES_POS_API_URL ?? 'http://localhost:3004/api/v1',
  reporting: process.env.NEXT_PUBLIC_REPORTING_API_URL ?? 'http://localhost:3003/api/v1',
};
