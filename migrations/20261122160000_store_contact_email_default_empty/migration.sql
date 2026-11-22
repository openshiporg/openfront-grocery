-- New stores start with no public contact email instead of an example-domain placeholder.
ALTER TABLE "StoreSettings" ALTER COLUMN "contactEmail" SET DEFAULT '';
