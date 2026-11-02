/**
 * Product photos: an uploaded Keystone image on the private my_images S3 bucket wins over the
 * legacy Image URL text. Signed URLs expire, so they are resolved on every read, never stored.
 */
const IMAGE_EXTENSIONS = ['jpg', 'png', 'webp', 'gif'] as const;
type ImageExtension = (typeof IMAGE_EXTENSIONS)[number];
type ImagesContext = { images(storage: string): { getUrl(id: string, extension: ImageExtension): Promise<string> } };

export type ProductImageRow = { image_id?: string | null; image_extension?: string | null; imageUrl?: string | null; thumbnailUrl?: string | null };

export function uploadedImageKey(row?: ProductImageRow | null) {
  if (!row?.image_id || !/^[A-Za-z0-9_-]{1,128}$/.test(row.image_id)) return null;
  if (!IMAGE_EXTENSIONS.includes(row.image_extension as ImageExtension)) return null;
  return { id: row.image_id, extension: row.image_extension as ImageExtension };
}

function text(value?: string | null) {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** The displayable image and thumbnail for a product row; an unreadable upload falls back to the text URLs. */
export async function resolveProductImage(context: unknown, row: ProductImageRow) {
  const key = uploadedImageKey(row);
  if (key) {
    try {
      const url = await (context as ImagesContext).images('my_images').getUrl(key.id, key.extension);
      if (text(url)) return { imageUrl: url, thumbnailUrl: url };
    } catch {
      // fall through to the legacy text URLs
    }
  }
  const imageUrl = text(row.imageUrl);
  return { imageUrl, thumbnailUrl: text(row.thumbnailUrl) ?? imageUrl };
}
