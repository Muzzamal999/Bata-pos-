-- CreateEnum
CREATE TYPE "StockInwardStatus" AS ENUM ('DRAFT', 'CONFIRMED');

-- CreateTable
CREATE TABLE "stock_inward_receipts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "status" "StockInwardStatus" NOT NULL DEFAULT 'DRAFT',
    "supplierReference" TEXT,
    "createdByUserId" UUID,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_inward_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_inward_lines" (
    "id" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "expectedQty" INTEGER NOT NULL,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_inward_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_inward_receipts_tenantId_branchId_idx" ON "stock_inward_receipts"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_inward_receipts_tenantId_referenceNumber_key" ON "stock_inward_receipts"("tenantId", "referenceNumber");

-- CreateIndex
CREATE INDEX "stock_inward_lines_receiptId_idx" ON "stock_inward_lines"("receiptId");

-- CreateIndex
CREATE INDEX "stock_inward_lines_variantId_idx" ON "stock_inward_lines"("variantId");

-- AddForeignKey
ALTER TABLE "stock_inward_lines" ADD CONSTRAINT "stock_inward_lines_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "stock_inward_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_inward_lines" ADD CONSTRAINT "stock_inward_lines_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
