-- CreateTable
CREATE TABLE "sale_line_records" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "saleId" TEXT NOT NULL,
    "variantId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_line_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_line_records_tenantId_variantId_idx" ON "sale_line_records"("tenantId", "variantId");

-- CreateIndex
CREATE INDEX "sale_line_records_tenantId_branchId_occurredAt_idx" ON "sale_line_records"("tenantId", "branchId", "occurredAt");
