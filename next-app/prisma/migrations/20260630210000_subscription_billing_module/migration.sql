-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('DRAFT', 'ISSUED', 'RENEWED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingPayStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "BillingAttemptStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "SubscriptionBilling" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "billingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "renewalDate" TIMESTAMP(3) NOT NULL,
    "planName" TEXT NOT NULL,
    "planSlug" TEXT NOT NULL,
    "cycleLabel" TEXT NOT NULL,
    "billingAmountPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "gstBps" INTEGER NOT NULL DEFAULT 0,
    "gstPaise" INTEGER NOT NULL DEFAULT 0,
    "walletUsedPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL,
    "amountPaidPaise" INTEGER NOT NULL DEFAULT 0,
    "autoPay" BOOLEAN NOT NULL DEFAULT false,
    "paymentStatus" "BillingPayStatus" NOT NULL DEFAULT 'PENDING',
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'ISSUED',
    "attemptsCount" INTEGER NOT NULL DEFAULT 0,
    "invoiceNumber" TEXT,
    "invoiceIssuedAt" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionBilling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingItem" (
    "id" TEXT NOT NULL,
    "billingId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "variantLabel" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPaise" INTEGER NOT NULL,
    "lineTotalPaise" INTEGER NOT NULL,

    CONSTRAINT "BillingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPaymentAttempt" (
    "id" TEXT NOT NULL,
    "billingId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'UPI',
    "status" "BillingAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "amountPaise" INTEGER NOT NULL,
    "walletPaise" INTEGER NOT NULL DEFAULT 0,
    "reference" TEXT NOT NULL,
    "gatewayRef" TEXT,
    "failureReason" TEXT,
    "byId" TEXT,
    "byRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingPaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "billingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "byId" TEXT,
    "byRole" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "gstBps" INTEGER NOT NULL DEFAULT 0,
    "autopayRetryLimit" INTEGER NOT NULL DEFAULT 3,
    "autopayRetryIntervalHours" INTEGER NOT NULL DEFAULT 24,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'DOODLY/SB',
    "companyName" TEXT NOT NULL DEFAULT 'DOODLY',
    "gstin" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionBilling_code_key" ON "SubscriptionBilling"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionBilling_invoiceNumber_key" ON "SubscriptionBilling"("invoiceNumber");

-- CreateIndex
CREATE INDEX "SubscriptionBilling_userId_billingDate_idx" ON "SubscriptionBilling"("userId", "billingDate");

-- CreateIndex
CREATE INDEX "SubscriptionBilling_paymentStatus_idx" ON "SubscriptionBilling"("paymentStatus");

-- CreateIndex
CREATE INDEX "SubscriptionBilling_billingStatus_idx" ON "SubscriptionBilling"("billingStatus");

-- CreateIndex
CREATE INDEX "SubscriptionBilling_renewalDate_idx" ON "SubscriptionBilling"("renewalDate");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionBilling_subscriptionId_cycleNumber_key" ON "SubscriptionBilling"("subscriptionId", "cycleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPaymentAttempt_reference_key" ON "BillingPaymentAttempt"("reference");

-- CreateIndex
CREATE INDEX "BillingPaymentAttempt_billingId_attemptNo_idx" ON "BillingPaymentAttempt"("billingId", "attemptNo");

-- CreateIndex
CREATE INDEX "BillingEvent_billingId_createdAt_idx" ON "BillingEvent"("billingId", "createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionBilling" ADD CONSTRAINT "SubscriptionBilling_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionBilling" ADD CONSTRAINT "SubscriptionBilling_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingItem" ADD CONSTRAINT "BillingItem_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "SubscriptionBilling"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPaymentAttempt" ADD CONSTRAINT "BillingPaymentAttempt_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "SubscriptionBilling"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingEvent" ADD CONSTRAINT "BillingEvent_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "SubscriptionBilling"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

