/*
  Warnings:

  - You are about to drop the column `capturePaymentFunction` on the `PaymentProvider` table. All the data in the column will be lost.
  - You are about to drop the column `createPaymentFunction` on the `PaymentProvider` table. All the data in the column will be lost.
  - You are about to drop the column `credentials` on the `PaymentProvider` table. All the data in the column will be lost.
  - You are about to drop the column `generatePaymentLinkFunction` on the `PaymentProvider` table. All the data in the column will be lost.
  - You are about to drop the column `getPaymentStatusFunction` on the `PaymentProvider` table. All the data in the column will be lost.
  - You are about to drop the column `handleWebhookFunction` on the `PaymentProvider` table. All the data in the column will be lost.
  - You are about to drop the column `refundPaymentFunction` on the `PaymentProvider` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "PaymentWebhookEventStatusType" AS ENUM ('processing', 'processed', 'ignored');

-- AlterTable
ALTER TABLE "PaymentProvider" DROP COLUMN "capturePaymentFunction",
DROP COLUMN "createPaymentFunction",
DROP COLUMN "credentials",
DROP COLUMN "generatePaymentLinkFunction",
DROP COLUMN "getPaymentStatusFunction",
DROP COLUMN "handleWebhookFunction",
DROP COLUMN "refundPaymentFunction";

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "replayKey" TEXT NOT NULL DEFAULT '',
    "providerCode" TEXT NOT NULL DEFAULT '',
    "providerEventId" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL DEFAULT '',
    "payloadHash" TEXT NOT NULL DEFAULT '',
    "claimToken" TEXT NOT NULL DEFAULT '',
    "status" "PaymentWebhookEventStatusType" NOT NULL DEFAULT 'processing',
    "paymentRecordId" TEXT NOT NULL DEFAULT '',
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_replayKey_key" ON "PaymentWebhookEvent"("replayKey");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_providerCode_idx" ON "PaymentWebhookEvent"("providerCode");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_providerEventId_idx" ON "PaymentWebhookEvent"("providerEventId");
