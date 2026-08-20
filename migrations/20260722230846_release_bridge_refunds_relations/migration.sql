-- CreateEnum
CREATE TYPE "PaymentRefundStatusType" AS ENUM ('processing', 'succeeded', 'failed');

-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_store_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryRoute" DROP CONSTRAINT "DeliveryRoute_store_fkey";

-- DropForeignKey
ALTER TABLE "DeliverySlot" DROP CONSTRAINT "DeliverySlot_store_fkey";

-- DropForeignKey
ALTER TABLE "GroceryOutboxEvent" DROP CONSTRAINT "GroceryOutboxEvent_store_fkey";

-- DropForeignKey
ALTER TABLE "InventoryLot" DROP CONSTRAINT "InventoryLot_store_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_deliverySlot_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_pickupSlot_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_store_fkey";

-- DropForeignKey
ALTER TABLE "ParkingSpot" DROP CONSTRAINT "ParkingSpot_store_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_store_fkey";

-- DropForeignKey
ALTER TABLE "PickupSlot" DROP CONSTRAINT "PickupSlot_store_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_store_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_store_fkey";

-- DropForeignKey
ALTER TABLE "Supplier" DROP CONSTRAINT "Supplier_store_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_store_fkey";

-- AlterTable
ALTER TABLE "Cart" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "store" TEXT;

-- AlterTable
ALTER TABLE "DeliveryRoute" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DeliverySlot" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "store" TEXT;

-- AlterTable
ALTER TABLE "GroceryOutboxEvent" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "InventoryLot" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ParkingSpot" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PaymentWebhookEvent" ADD COLUMN     "payment" TEXT;

-- AlterTable
ALTER TABLE "PickupSlot" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Supplier" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- CreateTable
CREATE TABLE "PaymentRefund" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(10,2) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PaymentRefundStatusType" NOT NULL DEFAULT 'processing',
    "providerCode" TEXT NOT NULL DEFAULT '',
    "providerPaymentId" TEXT NOT NULL DEFAULT '',
    "providerRefundId" TEXT NOT NULL DEFAULT '',
    "providerStatus" TEXT NOT NULL DEFAULT '',
    "providerData" JSONB DEFAULT '{}',
    "failureMessage" TEXT NOT NULL DEFAULT '',
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "payment" TEXT,
    "requestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRefund_idempotencyKey_key" ON "PaymentRefund"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentRefund_payment_idx" ON "PaymentRefund"("payment");

-- CreateIndex
CREATE INDEX "PaymentRefund_requestedBy_idx" ON "PaymentRefund"("requestedBy");

-- CreateIndex
CREATE INDEX "Coupon_store_idx" ON "Coupon"("store");

-- CreateIndex
CREATE INDEX "Department_store_idx" ON "Department"("store");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_payment_idx" ON "PaymentWebhookEvent"("payment");

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRoute" ADD CONSTRAINT "DeliveryRoute_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverySlot" ADD CONSTRAINT "DeliverySlot_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryOutboxEvent" ADD CONSTRAINT "GroceryOutboxEvent_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliverySlot_fkey" FOREIGN KEY ("deliverySlot") REFERENCES "DeliverySlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_pickupSlot_fkey" FOREIGN KEY ("pickupSlot") REFERENCES "PickupSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingSpot" ADD CONSTRAINT "ParkingSpot_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSlot" ADD CONSTRAINT "PickupSlot_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
