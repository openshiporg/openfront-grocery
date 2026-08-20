-- Storefront branding remains owned by the existing one-per-Store settings row.
-- Existing stores remain explicitly unset and use the application default until
-- an operator chooses a persisted preset.
ALTER TABLE "StoreSettings" ADD COLUMN "brandHue" INTEGER;

ALTER TABLE "StoreSettings"
  ADD CONSTRAINT "StoreSettings_brandHue_range"
  CHECK ("brandHue" IS NULL OR ("brandHue" >= 0 AND "brandHue" <= 359));
