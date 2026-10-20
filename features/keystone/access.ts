export type Session = {
  itemId: string
  listKey: string
  data: {
    name: string
    store?: { id: string; code?: string; name?: string }
    role: {
      id: string
      name: string
      canManageProducts: boolean
      canManageOrders: boolean
      canManageInventory: boolean
      canManageSuppliers: boolean
      canManageDelivery: boolean
      canManageUsers: boolean
      canManagePayments: boolean
      canManageOnboarding: boolean
      canAccessDashboard: boolean
    }
  }
}

type AccessArgs = {
  session?: Session
  context?: { prisma?: any }
}

export type Capability = keyof Pick<Session['data']['role'],
  'canManageProducts' | 'canManageOrders' | 'canManageInventory' | 'canManageSuppliers' |
  'canManageDelivery' | 'canManageUsers' | 'canManagePayments' | 'canManageOnboarding' | 'canAccessDashboard'
>

export async function requireFreshCapability(context: { session?: Session; sudo(): any; prisma?: any }, capability: Capability) {
  const session = context.session;
  if (!session?.itemId) throw new Error('Authentication required');
  const sudoContext = context.sudo();
  if (!context.prisma?.$queryRaw || !sudoContext?.query?.User?.findOne) {
    throw new Error('Current capability context is unavailable');
  }
  const user = await sudoContext.query.User.findOne({
    where: { id: session.itemId },
    query: `id privacyErasedAt store { id isActive } role { ${capability} }`,
  });
  if (user?.privacyErasedAt || !user?.store?.isActive || !user.role?.[capability]) throw new Error(`Missing current capability: ${capability}`);
  return { user, storeId: user.store.id };
}

export function isSignedIn({ session }: AccessArgs) {
  return Boolean(session)
}

/**
 * A signed-in account that is still current: not erased and a member of an
 * active Store. Used where customers create their own records, so a stale
 * cookie cannot recreate data after an approved erasure.
 */
export async function isCurrentAccount({ session, context }: AccessArgs) {
  if (!session?.itemId || !context?.prisma?.user?.findUnique) return false;
  const user = await context.prisma.user.findUnique({
    where: { id: session.itemId },
    select: { privacyErasedAt: true, store: { select: { isActive: true } } },
  });
  return Boolean(user && !user.privacyErasedAt && user.store?.isActive);
}

function currentPermission(capability: Capability) {
  return async ({ session, context }: AccessArgs) => {
    if (!session?.itemId || !context?.prisma?.user) return false;
    const user = await context.prisma.user.findUnique({
      where: { id: session.itemId },
      select: { privacyErasedAt: true, store: { select: { isActive: true } }, role: { select: { [capability]: true } } },
    });
    return Boolean(!user?.privacyErasedAt && user?.store?.isActive && user.role?.[capability]);
  };
}

// Keystone access functions are MaybePromise-aware. Resolve every privileged
// generic CRUD/field decision from current database state so a revoked
// stateless cookie cannot retain authority until its max age.
export const permissions = {
  canManageProducts: currentPermission('canManageProducts'),
  canManageOrders: currentPermission('canManageOrders'),
  canManageInventory: currentPermission('canManageInventory'),
  canManageSuppliers: currentPermission('canManageSuppliers'),
  canManageDelivery: currentPermission('canManageDelivery'),
  canManageUsers: currentPermission('canManageUsers'),
  canManagePayments: currentPermission('canManagePayments'),
  canManageOnboarding: currentPermission('canManageOnboarding'),
  canAccessDashboard: currentPermission('canAccessDashboard'),
}

export const rules = {
  canReadPeople: ({ session }: AccessArgs) => {
    if (!session) return false

    if (session.data.role?.canManageUsers) return true

    return { id: { equals: session.itemId } }
  },
  canUpdatePeople: ({ session }: AccessArgs) => {
    if (!session) return false

    if (session.data.role?.canManageUsers) return true

    return { id: { equals: session.itemId } }
  },
}