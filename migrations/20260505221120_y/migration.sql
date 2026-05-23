/*
  Warnings:

  - You are about to drop the column `stripeChargeId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `stripePaymentIntentId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `stripeRefundId` on the `Payment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[providerPaymentId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - Made the column `createdAt` on table `Payment` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "UserOnboardingStatusType" AS ENUM ('not_started', 'in_progress', 'completed', 'dismissed');

-- DropIndex
DROP INDEX "Payment_stripePaymentIntentId_key";

-- AlterTable
ALTER TABLE "BackInStockAlert" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "FavoriteProduct" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "stripeChargeId",
DROP COLUMN "stripePaymentIntentId",
DROP COLUMN "stripeRefundId",
ADD COLUMN     "paymentProvider" TEXT,
ADD COLUMN     "providerChargeId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "providerData" JSONB DEFAULT '{}',
ADD COLUMN     "providerPaymentId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "providerRefundId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "createdAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "PriceAlert" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "RecipeIngredient" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "canManageOnboarding" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManagePayments" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ShoppingListItem" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingStatus" "UserOnboardingStatusType" DEFAULT 'not_started';

-- CreateTable
CREATE TABLE "PaymentProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "isInstalled" BOOLEAN NOT NULL DEFAULT true,
    "credentials" JSONB DEFAULT '{}',
    "metadata" JSONB DEFAULT '{}',
    "createPaymentFunction" TEXT NOT NULL DEFAULT 'manual',
    "capturePaymentFunction" TEXT NOT NULL DEFAULT 'manual',
    "refundPaymentFunction" TEXT NOT NULL DEFAULT 'manual',
    "getPaymentStatusFunction" TEXT NOT NULL DEFAULT 'manual',
    "generatePaymentLinkFunction" TEXT NOT NULL DEFAULT 'manual',
    "handleWebhookFunction" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSession" (
    "id" TEXT NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "isInitiated" BOOLEAN NOT NULL DEFAULT false,
    "amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "data" JSONB DEFAULT '{}',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "cart" TEXT,
    "paymentProvider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProvider_code_key" ON "PaymentProvider"("code");

-- CreateIndex
CREATE INDEX "PaymentSession_cart_idx" ON "PaymentSession"("cart");

-- CreateIndex
CREATE INDEX "PaymentSession_paymentProvider_idx" ON "PaymentSession"("paymentProvider");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "Payment_paymentProvider_idx" ON "Payment"("paymentProvider");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentProvider_fkey" FOREIGN KEY ("paymentProvider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_cart_fkey" FOREIGN KEY ("cart") REFERENCES "Cart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_paymentProvider_fkey" FOREIGN KEY ("paymentProvider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
