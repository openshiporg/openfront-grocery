// Query keys for React Query cache management

export const queryKeys = {
  products: {
    all: ['products'] as const,
    list: (filters?: { departmentId?: string; limit?: number }) =>
      ['products', 'list', filters] as const,
    detail: (id: string) => ['products', 'detail', id] as const,
    byHandle: (handle: string) => ['products', 'byHandle', handle] as const,
  },
  departments: {
    all: ['departments'] as const,
    list: () => ['departments', 'list'] as const,
    detail: (id: string) => ['departments', 'detail', id] as const,
    byHandle: (handle: string) => ['departments', 'byHandle', handle] as const,
    products: (departmentId: string, filters?: { sortBy?: string; page?: number }) =>
      ['departments', departmentId, 'products', filters] as const,
  },
  cart: {
    all: ['cart'] as const,
    active: () => ['cart', 'active'] as const,
  },
  user: {
    all: ['user'] as const,
    profile: () => ['user', 'profile'] as const,
    addresses: () => ['user', 'addresses'] as const,
    orders: () => ['user', 'orders'] as const,
  },
  delivery: {
    windows: (date?: string) => ['delivery', 'windows', date] as const,
  },
  store: {
    info: () => ['store', 'info'] as const,
  },
};
