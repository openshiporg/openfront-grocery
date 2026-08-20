/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `PaymentSession` will be added. If there are existing duplicate values, this will fail.
  - Made the column `user` on table `BackInStockAlert` required. This step will fail if there are existing NULL values in that column.
  - Made the column `user` on table `FavoriteProduct` required. This step will fail if there are existing NULL values in that column.
  - Made the column `user` on table `NotificationPreference` required. This step will fail if there are existing NULL values in that column.
  - Made the column `user` on table `PriceAlert` required. This step will fail if there are existing NULL values in that column.
  - Made the column `user` on table `ShoppingList` required. This step will fail if there are existing NULL values in that column.
  - Made the column `list` on table `ShoppingListItem` required. This step will fail if there are existing NULL values in that column.
  - Made the column `user` on table `Subscription` required. This step will fail if there are existing NULL values in that column.
  - Made the column `user` on table `SubstitutionPreference` required. This step will fail if there are existing NULL values in that column.
  - Made the column `user` on table `UserCoupon` required. This step will fail if there are existing NULL values in that column.
  - Made the column `coupon` on table `UserCoupon` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "BackInStockAlert" DROP CONSTRAINT "BackInStockAlert_user_fkey";

-- DropForeignKey
ALTER TABLE "FavoriteProduct" DROP CONSTRAINT "FavoriteProduct_user_fkey";

-- DropForeignKey
ALTER TABLE "NotificationPreference" DROP CONSTRAINT "NotificationPreference_user_fkey";

-- DropForeignKey
ALTER TABLE "PriceAlert" DROP CONSTRAINT "PriceAlert_user_fkey";

-- DropForeignKey
ALTER TABLE "ShoppingList" DROP CONSTRAINT "ShoppingList_user_fkey";

-- DropForeignKey
ALTER TABLE "ShoppingListItem" DROP CONSTRAINT "ShoppingListItem_list_fkey";

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_user_fkey";

-- DropForeignKey
ALTER TABLE "SubstitutionPreference" DROP CONSTRAINT "SubstitutionPreference_user_fkey";

-- DropForeignKey
ALTER TABLE "UserCoupon" DROP CONSTRAINT "UserCoupon_coupon_fkey";

-- DropForeignKey
ALTER TABLE "UserCoupon" DROP CONSTRAINT "UserCoupon_user_fkey";

-- AlterTable
ALTER TABLE "BackInStockAlert" ALTER COLUMN "user" SET NOT NULL;

-- AlterTable
ALTER TABLE "FavoriteProduct" ALTER COLUMN "user" SET NOT NULL;

-- AlterTable
ALTER TABLE "NotificationPreference" ALTER COLUMN "user" SET NOT NULL;

-- AlterTable
ALTER TABLE "PriceAlert" ALTER COLUMN "user" SET NOT NULL;

-- AlterTable
ALTER TABLE "ShoppingList" ALTER COLUMN "user" SET NOT NULL;

-- AlterTable
ALTER TABLE "ShoppingListItem" ALTER COLUMN "list" SET NOT NULL;

-- AlterTable
ALTER TABLE "Subscription" ALTER COLUMN "user" SET NOT NULL;

-- AlterTable
ALTER TABLE "SubstitutionPreference" ALTER COLUMN "user" SET NOT NULL;

-- AlterTable
ALTER TABLE "UserCoupon" ALTER COLUMN "user" SET NOT NULL,
ALTER COLUMN "coupon" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSession_idempotencyKey_key" ON "PaymentSession"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "BackInStockAlert" ADD CONSTRAINT "BackInStockAlert_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteProduct" ADD CONSTRAINT "FavoriteProduct_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingList" ADD CONSTRAINT "ShoppingList_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_list_fkey" FOREIGN KEY ("list") REFERENCES "ShoppingList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubstitutionPreference" ADD CONSTRAINT "SubstitutionPreference_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCoupon" ADD CONSTRAINT "UserCoupon_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCoupon" ADD CONSTRAINT "UserCoupon_coupon_fkey" FOREIGN KEY ("coupon") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
