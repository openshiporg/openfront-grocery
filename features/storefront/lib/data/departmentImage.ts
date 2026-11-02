import type { GroceryDepartment } from '../../types';

/** A department as queried: the uploaded photo (Keystone image field) plus the legacy Image URL text. */
export type DepartmentWithImage = GroceryDepartment & { image?: { url?: string | null } | null };

/**
 * An uploaded aisle photo (private-bucket S3, signed URL resolved per render) wins over the
 * legacy Image URL text; neither means no image (the UI draws the aisle icon).
 */
export function withDepartmentImage({ image, ...department }: DepartmentWithImage): GroceryDepartment {
  const uploaded = typeof image?.url === 'string' && image.url.trim() ? image.url : undefined;
  const fallback = typeof department.imageUrl === 'string' && department.imageUrl.trim() ? department.imageUrl : undefined;
  return { ...department, imageUrl: uploaded ?? fallback };
}
