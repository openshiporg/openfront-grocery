// Re-export all data fetching functions and provide the lightweight prefetch
// helpers used by StorefrontServer.
import type { GroceryProduct, GroceryDepartment, GroceryCart, GroceryUser } from '../../types';
import { retrieveCart } from './cart';
import { getDepartmentsList } from './departments';
import { getProductsList } from './products';
import { getUser } from './user';

export async function fetchProducts(options?: {
  departmentId?: string;
  limit?: number;
}): Promise<GroceryProduct[]> {
  const { products } = await getProductsList({
    department: options?.departmentId,
    limit: options?.limit ?? 12,
    offset: 0,
  });

  return products;
}

export async function fetchUser(): Promise<GroceryUser | null> {
  return getUser();
}

export async function fetchCart(): Promise<GroceryCart | null> {
  return retrieveCart();
}

export async function fetchDepartments(): Promise<GroceryDepartment[]> {
  const { departments } = await getDepartmentsList(0, 12);
  return departments;
}

export * from './cart';
export * from './departments';
export * from './products';
export * from './user';
export * from './store';
export * from './lists';
export * from './deals';
export * from './orders';
