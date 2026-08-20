import type { Session } from '../access';

type AccessArgs = { session?: Session };

type Filter = Record<string, unknown> | false;

function sessionStoreId(session?: Session) {
  return session?.data.store?.id || null;
}

export function currentStoreId(session?: Session) {
  return sessionStoreId(session);
}

/** Store filter for Lists with a direct `store` relationship. */
export function currentStoreScopedFilter({ session }: AccessArgs): Filter {
  const storeId = sessionStoreId(session);
  return storeId ? { id: { equals: storeId } } : false;
}

export function publicStoreScopedFilter(): Filter {
  const storeId = process.env.PUBLIC_STORE_ID || 'store_juniper';
  return { store: { id: { equals: storeId } } };
}

export function storeScopedFilter({ session }: AccessArgs): Filter {
  const storeId = sessionStoreId(session);
  return storeId ? { store: { id: { equals: storeId } } } : false;
}

/** Store filter for Lists whose owner is another store-owned relation. */
export function relatedStoreScopedFilter(relation: string) {
  return ({ session }: AccessArgs): Filter => {
    const storeId = sessionStoreId(session);
    return storeId ? { [relation]: { store: { id: { equals: storeId } } } } : false;
  };
}

export function nestedRelatedStoreScopedFilter(...relations: string[]) {
  return ({ session }: AccessArgs): Filter => {
    const storeId = sessionStoreId(session);
    if (!storeId) return false;
    return relations.reduceRight<Record<string, unknown>>(
      (value, relation) => ({ [relation]: value }),
      { store: { id: { equals: storeId } } },
    );
  };
}

/** Store filter for owner-owned records such as Address and UserCoupon. */
export function oneOfRelatedStoreScopedFilter(...relations: string[]) {
  return ({ session }: AccessArgs): Filter => {
    const storeId = sessionStoreId(session);
    return storeId
      ? { OR: relations.map((relation) => ({ [relation]: { store: { id: { equals: storeId } } } })) }
      : false;
  };
}

export function ownerStoreScopedFilter(ownerField = 'user') {
  return ({ session }: AccessArgs): Filter => {
    const storeId = sessionStoreId(session);
    return storeId ? { [ownerField]: { store: { id: { equals: storeId } } } } : false;
  };
}

export function ownerScopedFilter(ownerField = 'user') {
  return ({ session }: AccessArgs): Filter =>
    session?.itemId ? { [ownerField]: { id: { equals: session.itemId } } } : false;
}

export function sameStoreInput(storeId: string | null | undefined, expectedStoreId: string | null | undefined) {
  if (!storeId || !expectedStoreId || storeId !== expectedStoreId) {
    throw new Error('Related record must belong to the active store');
  }
}
