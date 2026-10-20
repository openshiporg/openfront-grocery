import type { Session } from '../access';

type AccessArgs = { session?: Session; context?: { prisma?: any } };

type Filter = Record<string, unknown> | false;

function sessionStoreId(session?: Session) {
  return session?.data.store?.id || null;
}

export function currentStoreId(session?: Session) {
  return sessionStoreId(session);
}

/** Store filter for Lists with a direct `store` relationship. */
export async function currentStoreScopedFilter(args: AccessArgs): Promise<Filter> {
  const storeId = await currentMembershipStoreId(args);
  return storeId ? { id: { equals: storeId } } : false;
}

export function publicStoreScopedFilter(): Filter {
  const storeId = process.env.PUBLIC_STORE_ID || 'store_juniper';
  return { store: { id: { equals: storeId } } };
}

export function storeScopedFilter(args: AccessArgs): Promise<Filter> {
  return currentMembershipStoreScopedFilter(args);
}

/** Store filter for Lists whose owner is another store-owned relation. */
export function relatedStoreScopedFilter(relation: string) {
  return currentMembershipRelatedStoreScopedFilter(relation);
}

export async function currentMembershipStoreId({ session, context }: AccessArgs): Promise<string | null> {
  if (!session?.itemId || !context?.prisma?.user?.findUnique) return null;
  const user = await context.prisma.user.findUnique({
    where: { id: session.itemId },
    select: { privacyErasedAt: true, store: { select: { id: true, isActive: true } } },
  });
  return !user?.privacyErasedAt && user?.store?.isActive && user.store.id ? user.store.id : null;
}

// Store list scope is authorization data: never use a potentially stale Store
// snapshot from a stateless session when the current User→Store link is available.
export async function currentMembershipStoreScopedFilter(args: AccessArgs): Promise<Filter> {
  const storeId = await currentMembershipStoreId(args);
  return storeId ? { store: { id: { equals: storeId } } } : false;
}

export function currentMembershipRelatedStoreScopedFilter(relation: string) {
  return async (args: AccessArgs): Promise<Filter> => {
    const storeId = await currentMembershipStoreId(args);
    return storeId ? { [relation]: { store: { id: { equals: storeId } } } } : false;
  };
}

export function nestedRelatedStoreScopedFilter(...relations: string[]) {
  return async (args: AccessArgs): Promise<Filter> => {
    const storeId = await currentMembershipStoreId(args);
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
  return async (args: AccessArgs): Promise<Filter> => {
    const storeId = await currentMembershipStoreId(args);
    return storeId ? { [ownerField]: { store: { id: { equals: storeId } } } } : false;
  };
}

/**
 * Owner-owned records (favorites, alerts, preferences, addresses): only the
 * signed-in owner, and only while that account is current — not erased and
 * still a member of an active Store. A stale stateless cookie for an erased or
 * deactivated account matches nothing.
 */
export function ownerScopedFilter(ownerField = 'user') {
  return async (args: AccessArgs): Promise<Filter> => {
    const storeId = await currentMembershipStoreId(args);
    if (!storeId || !args.session?.itemId) return false;
    return { [ownerField]: { id: { equals: args.session.itemId }, store: { id: { equals: storeId } } } };
  };
}

export function sameStoreInput(storeId: string | null | undefined, expectedStoreId: string | null | undefined) {
  if (!storeId || !expectedStoreId || storeId !== expectedStoreId) {
    throw new Error('Related record must belong to the active store');
  }
}
