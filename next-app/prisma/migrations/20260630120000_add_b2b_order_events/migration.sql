-- CreateEnum
CREATE TYPE "B2BOrderEventType" AS ENUM ('CREATED', 'STATUS', 'PAYMENT', 'INVOICE', 'NOTE', 'EDIT');

-- CreateTable
CREATE TABLE "BusinessOrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "B2BOrderEventType" NOT NULL,
    "fromStatus" "B2BOrderStatus",
    "toStatus" "B2BOrderStatus",
    "note" TEXT,
    "byId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessOrderEvent_orderId_createdAt_idx" ON "BusinessOrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessOrder_paymentStatus_idx" ON "BusinessOrder"("paymentStatus");

-- AddForeignKey
ALTER TABLE "BusinessOrderEvent" ADD CONSTRAINT "BusinessOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "BusinessOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

