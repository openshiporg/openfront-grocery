-- Department aisle photo (Keystone image field on the my_images S3 storage). Optional; the
-- storefront falls back to Department.imageUrl when no photo is uploaded.
-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "image_extension" TEXT,
ADD COLUMN     "image_filesize" INTEGER,
ADD COLUMN     "image_height" INTEGER,
ADD COLUMN     "image_id" TEXT,
ADD COLUMN     "image_width" INTEGER;
