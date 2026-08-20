/*
  Warnings:

  - A unique constraint covering the columns `[displayId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Order_displayId_key" ON "Order"("displayId");
