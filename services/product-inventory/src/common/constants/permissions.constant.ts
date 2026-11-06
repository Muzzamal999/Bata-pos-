/**
 * Fixed catalog of permission codes this service enforces. These are opaque
 * strings as far as identity-organization is concerned - that service is the
 * single source of truth for which codes exist and which roles grant them
 * (via its Permissions/Roles API). This service only ever checks whether a
 * code is present in the caller's JWT claims; it never stores or manages
 * permissions itself.
 */
export const PERMISSIONS = {
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_READ: 'products.read',
  PRODUCTS_UPDATE: 'products.update',
  PRODUCTS_ACTIVATE: 'products.activate',
  PRODUCTS_DEACTIVATE: 'products.deactivate',

  BRANDS_CREATE: 'brands.create',
  BRANDS_READ: 'brands.read',
  BRANDS_UPDATE: 'brands.update',

  CATEGORIES_CREATE: 'categories.create',
  CATEGORIES_READ: 'categories.read',
  CATEGORIES_UPDATE: 'categories.update',

  VARIANTS_CREATE: 'variants.create',
  VARIANTS_READ: 'variants.read',
  VARIANTS_UPDATE: 'variants.update',
  VARIANTS_ACTIVATE: 'variants.activate',
  VARIANTS_DEACTIVATE: 'variants.deactivate',

  BARCODES_CREATE: 'barcodes.create',
  BARCODES_DELETE: 'barcodes.delete',

  PRICING_CREATE: 'pricing.create',
  PRICING_READ: 'pricing.read',
  PRICING_UPDATE: 'pricing.update',

  INVENTORY_READ: 'inventory.read',
  INVENTORY_STOCK_IN: 'inventory.stock_in',
  INVENTORY_STOCK_OUT: 'inventory.stock_out',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_MARK_DAMAGED: 'inventory.mark_damaged',

  STOCK_INWARD_CREATE: 'stock_inward.create',
  STOCK_INWARD_READ: 'stock_inward.read',
  STOCK_INWARD_UPDATE: 'stock_inward.update',
  STOCK_INWARD_CONFIRM: 'stock_inward.confirm',

  TRANSFERS_CREATE: 'transfers.create',
  TRANSFERS_READ: 'transfers.read',
  TRANSFERS_REQUEST: 'transfers.request',
  TRANSFERS_APPROVE: 'transfers.approve',
  TRANSFERS_REJECT: 'transfers.reject',
  TRANSFERS_CANCEL: 'transfers.cancel',
  TRANSFERS_DISPATCH: 'transfers.dispatch',
  TRANSFERS_MARK_IN_TRANSIT: 'transfers.mark_in_transit',
  TRANSFERS_RECEIVE: 'transfers.receive',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_CODES: PermissionCode[] = Object.values(PERMISSIONS);
