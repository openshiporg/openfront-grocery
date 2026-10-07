import type { Session } from '../access';
import { currentStoreScopedFilter } from './storeAccess';
import { getPublicStoreId } from './runtimeConfig';

type FreshInstallAccessArgs = {
  session?: Session;
  context?: {
    prisma?: {
      user?: { count(): Promise<number> };
    };
  };
};

/**
 * Match @keystone-6/auth's createInitialUser gate: no User may exist.
 * Keystone resolves/persists the nested Role BEFORE inserting the User, and
 * those writes are not implicitly atomic. A failed outer insert can leave an
 * unassigned Role; its existence must not permanently lock out owner setup.
 * Any User closes this window, even if that User has no Role.
 */
export async function isFreshInstallBootstrapWindow(context: FreshInstallAccessArgs['context']) {
  if (!context?.prisma?.user?.count) return false;
  return (await context.prisma.user.count()) === 0;
}

/**
 * Keystone verifies relationship `connect` inputs through the target List's
 * query access. The auth package's createInitialUser resolver is anonymous,
 * so the deterministic bootstrap Store is visible only inside the bounded
 * first-account window. This does not grant Store create/update/delete access.
 */
export async function canResolveFreshInstallStore({ session, context }: FreshInstallAccessArgs) {
  if (session?.itemId) return true;
  return isFreshInstallBootstrapWindow(context);
}

/** Scope authenticated users to their Store and the anonymous first-user
 * resolver to the one active Store configured for bootstrap. */
export async function freshInstallStoreQueryFilter(args: FreshInstallAccessArgs) {
  if (args.session?.itemId) return currentStoreScopedFilter(args);
  if (!(await canResolveFreshInstallStore(args))) return false;
  return {
    AND: [
      { id: { equals: getPublicStoreId() } },
      { isActive: { equals: true } },
    ],
  };
}
