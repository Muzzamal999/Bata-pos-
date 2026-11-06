-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "idempotencyKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "refunds_tenantId_idempotencyKey_key" ON "refunds"("tenantId", "idempotencyKey");
