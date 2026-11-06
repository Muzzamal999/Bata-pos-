-- CreateTable
CREATE TABLE "prices" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID,
    "variantId" UUID,
    "branchId" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" UUID NOT NULL,
    "priceId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID,
    "variantId" UUID,
    "branchId" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "action" TEXT NOT NULL,
    "changedByUserId" UUID,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prices_tenantId_productId_branchId_idx" ON "prices"("tenantId", "productId", "branchId");

-- CreateIndex
CREATE INDEX "prices_tenantId_variantId_branchId_idx" ON "prices"("tenantId", "variantId", "branchId");

-- CreateIndex
CREATE INDEX "price_history_priceId_idx" ON "price_history"("priceId");

-- CreateIndex
CREATE INDEX "price_history_tenantId_idx" ON "price_history"("tenantId");

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "prices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
