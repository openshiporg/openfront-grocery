-- Openfront logo library on the existing one-per-Store settings row (additive only).
-- logoIcon stays NULL for existing stores so their logoUrl artwork keeps rendering until an
-- operator explicitly chooses a library or custom SVG. logoColor is the logo's hue rotation.
ALTER TABLE "StoreSettings" ADD COLUMN "logoIcon" TEXT;
ALTER TABLE "StoreSettings" ADD COLUMN "logoColor" TEXT NOT NULL DEFAULT '0';
