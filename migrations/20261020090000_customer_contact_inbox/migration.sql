-- Customer contact inbox (adapted from Gym ContactMessage) and merchant policy notes. Additive only:
-- a new Store-scoped table and one defaulted StoreSettings column; no existing rows change.

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "policyNotes" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "customer" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "orderNumber" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "sourcePath" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'new',
    "staffNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactMessage_reference_key" ON "ContactMessage"("reference");

-- CreateIndex
CREATE INDEX "ContactMessage_store_idx" ON "ContactMessage"("store");

-- CreateIndex
CREATE INDEX "ContactMessage_customer_idx" ON "ContactMessage"("customer");

-- AddForeignKey
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_customer_fkey" FOREIGN KEY ("customer") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

