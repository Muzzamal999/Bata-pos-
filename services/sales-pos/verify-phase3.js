"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const node_crypto_1 = require("node:crypto");
const api_clients_1 = require("@bata-pos/api-clients");
const SECRET = 'JPQBLXQ09ZHfLPFD+u0FrqRcrFxq9qrMWiDCZDPePagiIVDH7aT5yb4NWd/8uizD';
const PI_PERMS = [
    'products.create', 'products.read', 'variants.create', 'variants.read',
    'barcodes.create', 'pricing.create', 'pricing.read', 'inventory.stock_in', 'inventory.read',
    'stock_inward.create', 'stock_inward.read', 'stock_inward.update', 'stock_inward.confirm',
    'transfers.create', 'transfers.read', 'transfers.request', 'transfers.reject',
];
const REP_PERMS = ['audit.read'];
function token(tenantId, perms) {
    return jsonwebtoken_1.default.sign({ sub: (0, node_crypto_1.randomUUID)(), tenantId, branchIds: [], roles: [], permissions: perms, type: 'access' }, SECRET, { expiresIn: '15m' });
}
async function main() {
    const tenantId = (0, node_crypto_1.randomUUID)();
    const branchId = (0, node_crypto_1.randomUUID)();
    const piHooks = {
        getAccessToken: () => token(tenantId, PI_PERMS),
        refreshAccessToken: async () => null,
        onAuthExpired: () => console.log('UNEXPECTED auth expired'),
    };
    const pi = new api_clients_1.ProductInventoryApi('http://localhost:3002/api/v1', piHooks);
    const product = await pi.createProduct({ articleNumber: `P3-${Date.now()}`, name: 'Phase 3 Test Shoe' });
    console.log('[products] createProduct OK:', product.id);
    const variant = await pi.createVariant(product.id, { size: '43', color: 'Brown' });
    console.log('[variants] createVariant OK:', variant.id);
    const barcode = await pi.addBarcode(variant.id, `BC-${Date.now()}`);
    console.log('[barcodes] addBarcode OK:', barcode.code);
    const variantsAfterBarcode = await pi.listVariants(product.id);
    if (variantsAfterBarcode[0].barcodes.length !== 1)
        throw new Error('Barcode not reflected in listVariants');
    console.log('[variants] listVariants reflects the new barcode OK');
    const price = await pi.createPrice({ variantId: variant.id, amount: 4500 });
    console.log('[pricing] createPrice OK:', price.amount);
    const pricesForProduct = await pi.listPrices({ productId: product.id, limit: 100 });
    const pricesForVariant = await pi.listPrices({ variantId: variant.id, limit: 100 });
    if (pricesForVariant.total !== 1)
        throw new Error(`Expected 1 price for variant, got ${pricesForVariant.total}`);
    console.log('[pricing] listPrices filtered by variantId OK, total:', pricesForVariant.total);
    console.log('[pricing] listPrices filtered by productId (sanity, expect 0 since price is variant-scoped):', pricesForProduct.total);
    const receipt = await pi.createReceipt({ branchId, supplierReference: 'PO-TEST-1' });
    console.log('[receiving] createReceipt OK:', receipt.referenceNumber, receipt.status);
    const afterLine = await pi.addReceiptLine(receipt.id, { variantId: variant.id, expectedQty: 20 });
    console.log('[receiving] addReceiptLine OK, lines:', afterLine.lines.length);
    const confirmed = await pi.confirmReceipt(receipt.id);
    console.log('[receiving] confirmReceipt OK, status:', confirmed.status);
    if (confirmed.status !== 'CONFIRMED')
        throw new Error('Expected CONFIRMED status');
    const balances = await pi.listBalances({ variantId: variant.id, branchId, limit: 10 });
    if (balances.data[0]?.onHandQty !== 20) {
        throw new Error(`Expected onHandQty 20 after confirming receipt, got ${JSON.stringify(balances.data)}`);
    }
    console.log('[receiving] stock balance correctly shows 20 on hand after confirm OK');
    const destinationBranchId = (0, node_crypto_1.randomUUID)();
    let transfer = await pi.createTransfer({
        sourceBranchId: branchId,
        destinationBranchId,
        lines: [{ variantId: variant.id, requestedQty: 5 }],
    });
    transfer = await pi.requestTransfer(transfer.id);
    console.log('[transfers] requestTransfer OK, status:', transfer.status);
    transfer = await pi.rejectTransfer(transfer.id);
    console.log('[transfers] rejectTransfer OK, status:', transfer.status);
    if (transfer.status !== 'REJECTED')
        throw new Error('Expected REJECTED status');
    const rep = new api_clients_1.ReportingApi('http://localhost:3003/api/v1', {
        getAccessToken: () => token(tenantId, REP_PERMS),
        refreshAccessToken: async () => null,
        onAuthExpired: () => console.log('UNEXPECTED auth expired'),
    });
    let auditLogs = { items: [], total: 0 };
    for (let i = 0; i < 15; i++) {
        auditLogs = await rep.listAuditLogs({ tenantId, action: 'price.updated', limit: 10 });
        if (auditLogs.total > 0)
            break;
        await new Promise((r) => setTimeout(r, 400));
    }
    if (auditLogs.total === 0)
        throw new Error('Expected the price.updated event to show up in the audit log via the real event chain');
    console.log('[audit] listAuditLogs OK - the real PriceUpdated event flowed through RabbitMQ into the audit log, total:', auditLogs.total);
    console.log('\nPHASE 3 DEEPENED MODULES VERIFIED END TO END AGAINST REAL BACKENDS');
}
main().catch((e) => {
    console.error('FAILED:', e.response?.status, JSON.stringify(e.response?.data) ?? e.message);
    process.exit(1);
});
//# sourceMappingURL=verify-phase3.js.map