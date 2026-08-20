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
    return { user: session.data, storeId: session.data.store?.id };
  }
  const user = await sudoContext.query.User.findOne({
    where: { id: session.itemId },
    query: `id store { id isActive } role { ${capability} }`,
  });
  if (!user?.store?.isActive || !user.role?.[capability]) throw new Error(`Missing current capability: ${capability}`);
  return { user, storeId: user.store.id };
}

export function isSignedIn({ session }: AccessArgs) {
  return Boolean(session)
}

function currentPermission(capability: Capability) {
  return async ({ session, context }: AccessArgs) => {
    if (!session?.itemId || !context?.prisma?.user) return false;
    const user = await context.prisma.user.findUnique({
      where: { id: session.itemId },
      select: { store: { select: { isActive: true } }, role: { select: { [capability]: true } } },
    });
    return Boolean(user?.store?.isActive && user.role?.[capability]);
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