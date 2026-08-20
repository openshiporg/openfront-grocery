/*
  Warnings:

  - Made the column `store` on table `Cart` required. This step will fail if there are existing NULL values in that column.
  - Made the column `store` on table `Coupon` required. This step will fail if there are existing NULL values in that column.
  - Made the column `store` on table `DeliveryRoute` required. This step will fail if there are existing NULL values in that column.
  - Made the column `store` on table `DeliverySlot` required. This step will fail if there are existing NULL values in that column.
  - Made the column `store` on table `Department` required. This step will fail if there are existing NULL values in that column.
  - Made the column `store` on table `GroceryOutboxEvent` required. This step will fail if there are existing NULL values in that column.
  - Made the column `store` on table `InventoryLot` required. This step will fail if there are existing NULL values in that column.
  - Made the column `store` on table `Order` required. This step will fail if there are existing NULL values in that column.
  - Made the column `store` on table `ParkingSpot` required. This step will fail if there are existing NULL values in that column.
  - Made the column `store` on table `Payment` required. This step will fail if there are existing NULL values in that column.
  - Made the column `payment` on table `PaymentRefund` required. This step will fail if there are existing NULL values in that column.
  - Made the column `requestedBy` on table `PaymentRefund` required. This step will fail if there are existing NULL values in that column.
  - Made the column `store` on table `PickupSlot` required. This step will fail if there are existing NULL values in that column.
  - Made the column `store` on table `Product` required. This step will fail if there are existing NULL values in that column.
  - Made the column `store` on table `PurchaseOrder` required. This step will fail if there are existing NULL values in that column.
  - Made the column `productRef` on table `ShoppingListItem` required. This step will fail if there are existing NULL values in that column.
  - Made the column `productRef` on table `Subscription` required. This step will fail if there are existing NULL values in that column.
  - Made the column `store` on table `Supplier` required. This step will fail if there are existing NULL values in that column.
  - Made the column `store` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_store_fkey";

-- DropForeignKey
ALTER TABLE "Coupon" DROP CONSTRAINT "Coupon_store_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryRoute" DROP CONSTRAINT "DeliveryRoute_store_fkey";

-- DropForeignKey
ALTER TABLE "DeliverySlot" DROP CONSTRAINT "DeliverySlot_store_fkey";

-- DropForeignKey
ALTER TABLE "Department" DROP CONSTRAINT "Department_store_fkey";

-- DropForeignKey
ALTER TABLE "GroceryOutboxEvent" DROP CONSTRAINT "GroceryOutboxEvent_store_fkey";

-- DropForeignKey
ALTER TABLE "InventoryLot" DROP CONSTRAINT "InventoryLot_store_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_store_fkey";

-- DropForeignKey
ALTER TABLE "ParkingSpot" DROP CONSTRAINT "ParkingSpot_store_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_store_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRefund" DROP CONSTRAINT "PaymentRefund_payment_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRefund" DROP CONSTRAINT "PaymentRefund_requestedBy_fkey";

-- DropForeignKey
ALTER TABLE "PickupSlot" DROP CONSTRAINT "PickupSlot_store_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_store_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_store_fkey";

-- DropForeignKey
ALTER TABLE "ShoppingListItem" DROP CONSTRAINT "ShoppingListItem_productRef_fkey";

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_productRef_fkey";

-- DropForeignKey
ALTER TABLE "Supplier" DROP CONSTRAINT "Supplier_store_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_store_fkey";

-- AlterTable
ALTER TABLE "Cart" ALTER COLUMN "store" SET NOT NULL;

-- AlterTable
ALTER TABLE "Coupon" ALTER COLUMN "store" SET NOT NULL;

-- AlterTable
ALTER TABLE "DeliveryRoute" ALTER COLUMN "store" SET NOT NULL;

-- AlterTable
ALTER TABLE "DeliverySlot" ALTER COLUMN "store" SET NOT NULL;

-- AlterTable
ALTER TABLE "Department" ALTER COLUMN "store" SET NOT NULL;

-- AlterTable
ALTER TABLE "GroceryOutboxEvent" ALTER COLUMN "store" SET NOT NULL;

-- AlterTable
ALTER TABLE "InventoryLot" ALTER COLUMN "store" SET NOT NULL;

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "store" SET NOT NULL;

-- AlterTable
ALTER TABLE "ParkingSpot" ALTER COLUMN "store" SET NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "store" SET NOT NULL;

-- AlterTable
ALTER TABLE "PaymentRefund" ALTER COLUMN "payment" SET NOT NULL,
ALTER COLUMN "requestedBy" SET NOT NULL;

-- AlterTable
ALTER TABLE "PickupSlot" ALTER COLUMN "store" SET NOT NULL;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "store" SET NOT NULL;

-- AlterTable
ALTER TABLE "PurchaseOrder" ALTER COLUMN "store" SET NOT NULL;

-- AlterTable
ALTER TABLE "ShoppingListItem" ALTER COLUMN "productRef" SET NOT NULL;

-- AlterTable
ALTER TABLE "Subscription" ALTER COLUMN "productRef" SET NOT NULL;

-- AlterTable
ALTER TABLE "Supplier" ALTER COLUMN "store" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "store" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRoute" ADD CONSTRAINT "DeliveryRoute_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverySlot" ADD CONSTRAINT "DeliverySlot_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryOutboxEvent" ADD CONSTRAINT "GroceryOutboxEvent_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingSpot" ADD CONSTRAINT "ParkingSpot_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSlot" ADD CONSTRAINT "PickupSlot_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_productRef_fkey" FOREIGN KEY ("productRef") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_productRef_fkey" FOREIGN KEY ("productRef") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
