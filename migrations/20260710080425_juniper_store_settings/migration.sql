-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Juniper Market',
    "tagline" TEXT NOT NULL DEFAULT 'Neighborhood grocery · delivery & curbside pickup',
    "homepageTitle" TEXT NOT NULL DEFAULT 'Fresh from the neighborhood',
    "homepageDescription" TEXT NOT NULL DEFAULT 'Seasonal produce, pantry staples, and household essentials selected for everyday shopping.',
    "contactEmail" TEXT NOT NULL DEFAULT 'hello@junipermarket.example',
    "contactPhone" TEXT NOT NULL DEFAULT '(415) 555-0148',
    "address" TEXT NOT NULL DEFAULT '184 Juniper Street, San Francisco, CA 94107',
    "logoUrl" TEXT NOT NULL DEFAULT '/logo.svg',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "countryCode" TEXT NOT NULL DEFAULT 'US',
    "hours" JSONB DEFAULT '{"monday":"8:00 AM - 8:00 PM","tuesday":"8:00 AM - 8:00 PM","wednesday":"8:00 AM - 8:00 PM","thursday":"8:00 AM - 8:00 PM","friday":"8:00 AM - 9:00 PM","saturday":"8:00 AM - 9:00 PM","sunday":"9:00 AM - 7:00 PM"}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);
