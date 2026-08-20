-- Store-owned tax policy. Existing single-location installs retain the former
-- explicit 8.75% behavior until an operator chooses a new basis-point rate.
ALTER TABLE "StoreSettings" ADD COLUMN "taxRateBps" INTEGER NOT NULL DEFAULT 875;
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_taxRateBps_range"
  CHECK ("taxRateBps" BETWEEN 0 AND 10000);

-- Normal model CRUD writes legacy display units; these checks ensure the hook
-- keeps authoritative coupon minor units synchronized.
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_fixed_discount_minor_units_match"
  CHECK ("discountType" <> 'fixed' OR "discountValueCents" = ROUND("discountValue"::numeric * 100)::INTEGER);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_min_purchase_minor_units_match"
  CHECK ("minPurchaseCents" = ROUND(COALESCE("minPurchase", 0)::numeric * 100)::INTEGER);
