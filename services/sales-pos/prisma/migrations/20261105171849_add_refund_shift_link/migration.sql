-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "shiftId" UUID;

-- CreateIndex
CREATE INDEX "refunds_shiftId_idx" ON "refunds"("shiftId");

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
