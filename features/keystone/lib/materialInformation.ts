import { createHash } from 'node:crypto';

/** Product fields that change what the customer is buying or can safely eat. */
export const MATERIAL_INFORMATION_FIELDS = 'allergens nutrition variantLabel packBaseUnitsMilli informationSource';

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value ?? null;
}

/**
 * The grocery declarations a shopper saw (allergens, nutrition, variant/pack)
 * frozen onto requested lines, replacement offers and actual goods, with a
 * fingerprint of the content and the latest information version identity.
 * Historical rows without a snapshot stay unknown; they are never backfilled
 * from today's catalog.
 */
export function materialInformationSnapshot(product: any, versionId: string | null) {
  const content = {
    allergens: Array.isArray(product?.allergens) ? product.allergens : [],
    nutrition: product?.nutrition ?? null,
    variantLabel: String(product?.variantLabel || ''),
    packBaseUnitsMilli: Number(product?.packBaseUnitsMilli ?? 1000),
    informationSource: String(product?.informationSource || ''),
  };
  return { ...content, versionId, fingerprint: createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex') };
}

/** Latest ProductInformationVersion id per product (null when only the initial information exists). */
export async function latestInformationVersionIds(prisma: any, productIds: string[]) {
  const versions = productIds.length ? await prisma.productInformationVersion.findMany({
    where: { productId: { in: productIds } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, productId: true },
  }) : [];
  const latest = new Map<string, string>();
  for (const version of versions) if (version.productId && !latest.has(version.productId)) latest.set(version.productId, version.id);
  return latest;
}
