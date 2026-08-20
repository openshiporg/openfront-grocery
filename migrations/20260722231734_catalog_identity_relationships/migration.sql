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
ALTER TABLE "Supplier" DROP CONSTRAINT "Supplier_store_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_store_fkey";

-- AlterTable
ALTER TABLE "BackInStockAlert" ADD COLUMN     "productRef" TEXT;

-- AlterTable
ALTER TABLE "Cart" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Coupon" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DeliveryRoute" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DeliverySlot" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Department" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FavoriteProduct" ADD COLUMN     "productRef" TEXT;

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
ALTER TABLE "PaymentRefund" ALTER COLUMN "payment" DROP NOT NULL,
ALTER COLUMN "requestedBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PickupSlot" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PriceAlert" ADD COLUMN     "productRef" TEXT;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RecipeIngredient" ADD COLUMN     "productRef" TEXT;

-- AlterTable
ALTER TABLE "ShoppingListItem" ADD COLUMN     "productRef" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "productRef" TEXT;

-- AlterTable
ALTER TABLE "Supplier" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "store" DROP NOT NULL,
ALTER COLUMN "store" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "BackInStockAlert_productRef_idx" ON "BackInStockAlert"("productRef");

-- CreateIndex
CREATE INDEX "FavoriteProduct_productRef_idx" ON "FavoriteProduct"("productRef");

-- CreateIndex
CREATE INDEX "PriceAlert_productRef_idx" ON "PriceAlert"("productRef");

-- CreateIndex
CREATE INDEX "RecipeIngredient_productRef_idx" ON "RecipeIngredient"("productRef");

-- CreateIndex
CREATE INDEX "ShoppingListItem_productRef_idx" ON "ShoppingListItem"("productRef");

-- CreateIndex
CREATE INDEX "Subscription_productRef_idx" ON "Subscription"("productRef");

-- AddForeignKey
ALTER TABLE "BackInStockAlert" ADD CONSTRAINT "BackInStockAlert_productRef_fkey" FOREIGN KEY ("productRef") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "FavoriteProduct" ADD CONSTRAINT "FavoriteProduct_productRef_fkey" FOREIGN KEY ("productRef") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "PickupSlot" ADD CONSTRAINT "PickupSlot_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_productRef_fkey" FOREIGN KEY ("productRef") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_productRef_fkey" FOREIGN KEY ("productRef") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_productRef_fkey" FOREIGN KEY ("productRef") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_productRef_fkey" FOREIGN KEY ("productRef") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
