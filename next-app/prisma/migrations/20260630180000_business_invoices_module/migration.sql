-- CreateEnum
CREATE TYPE "B2BInvoiceStatus" AS ENUM ('ISSUED', 'PARTIAL', 'PAID', 'VOID');

-- AlterTable
ALTER TABLE "BusinessInvoice" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "status" "B2BInvoiceStatus" NOT NULL DEFAULT 'ISSUED',
ADD COLUMN     "terms" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BusinessInvoiceEvent" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "byId" TEXT,
    "byRole" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessInvoiceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessInvoiceEvent_invoiceId_createdAt_idx" ON "BusinessInvoiceEvent"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessInvoice_status_idx" ON "BusinessInvoice"("status");

-- CreateIndex
CREATE INDEX "BusinessInvoice_businessId_idx" ON "BusinessInvoice"("businessId");

-- AddForeignKey
ALTER TABLE "BusinessInvoiceEvent" ADD CONSTRAINT "BusinessInvoiceEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BusinessInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

