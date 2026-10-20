import { keystoneClient } from '@/features/platform/lib/platformClient';
import { platformProjections } from '@/features/platform/lib/platformProjections';

export const PRODUCT_FIELDS = 'id title handle sku status priceCents pricingMethod unitOfMeasure imageUrl isPerishable shelfLife taxRateBasisPoints lowStockThreshold organicCertified informationSource variantLabel updatedAt departmentRef { id name } supplier { id name }';

/** Department and supplier choices for the product form (the product's current ones are always kept). */
export async function loadProductFormOptions() {
  const [options, merchandising] = await Promise.all([
    keystoneClient<any>('query{ departments(take:200,orderBy:[{sortOrder:asc},{name:asc}]){ id name } suppliers(take:200,orderBy:[{name:asc}]){ id name } }', {}, { cache: 'no-store' }),
    platformProjections.merchandising(1, 1).catch(() => null),
  ]);
  if (!options.success) throw new Error(options.error || 'Departments and suppliers could not be loaded.');
  return { departments: options.data?.departments || [], suppliers: options.data?.suppliers || [], currencyCode: merchandising?.currencyCode || 'USD' };
}
