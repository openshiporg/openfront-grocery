export type Session = {
  itemId: string
  listKey: string
  data: {
    name: string
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
}

export function isSignedIn({ session }: AccessArgs) {
  return Boolean(session)
}

export const permissions = {
  canManageProducts: ({ session }: AccessArgs) => session?.data.role?.canManageProducts ?? false,
  canManageOrders: ({ session }: AccessArgs) => session?.data.role?.canManageOrders ?? false,
  canManageInventory: ({ session }: AccessArgs) => session?.data.role?.canManageInventory ?? false,
  canManageSuppliers: ({ session }: AccessArgs) => session?.data.role?.canManageSuppliers ?? false,
  canManageDelivery: ({ session }: AccessArgs) => session?.data.role?.canManageDelivery ?? false,
  canManageUsers: ({ session }: AccessArgs) => session?.data.role?.canManageUsers ?? false,
  canManagePayments: ({ session }: AccessArgs) => session?.data.role?.canManagePayments ?? false,
  canManageOnboarding: ({ session }: AccessArgs) => session?.data.role?.canManageOnboarding ?? false,
  canAccessDashboard: ({ session }: AccessArgs) => session?.data.role?.canAccessDashboard ?? false,
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