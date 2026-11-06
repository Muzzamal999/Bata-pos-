-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'REFUNDED');

-- CreateTable
CREATE TABLE "processed_events" (
    "id" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_records" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "saleId" TEXT NOT NULL,
    "cashierId" UUID,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "paymentMethod" TEXT,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "refundedAt" TIMESTAMP(3),
    "refundAmount" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movement_records" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movement_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_change_records" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID,
    "variantId" UUID,
    "branchId" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_change_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_events" (
    "id" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "error" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dead_letter_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "processed_events_eventType_idx" ON "processed_events"("eventType");

-- CreateIndex
CREATE INDEX "sale_records_tenantId_branchId_occurredAt_idx" ON "sale_records"("tenantId", "branchId", "occurredAt");

-- CreateIndex
CREATE INDEX "sale_records_tenantId_cashierId_idx" ON "sale_records"("tenantId", "cashierId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_records_tenantId_saleId_key" ON "sale_records"("tenantId", "saleId");

-- CreateIndex
CREATE INDEX "stock_movement_records_tenantId_branchId_occurredAt_idx" ON "stock_movement_records"("tenantId", "branchId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movement_records_tenantId_variantId_idx" ON "stock_movement_records"("tenantId", "variantId");

-- CreateIndex
CREATE INDEX "price_change_records_tenantId_productId_idx" ON "price_change_records"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "price_change_records_tenantId_variantId_idx" ON "price_change_records"("tenantId", "variantId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs"("entityType");
