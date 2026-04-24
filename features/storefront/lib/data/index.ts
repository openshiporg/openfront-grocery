// Re-export all data fetching functions
import type { GroceryProduct, GroceryDepartment, GroceryCart, GroceryUser } from '../../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/graphql';

// Products
export async function fetchProducts(options?: { departmentId?: string; limit?: number }): Promise<GroceryProduct[]> {
  // TODO: Implement GraphQL query
  return [];
}

// User
export async function fetchUser(): Promise<GroceryUser | null> {
  // TODO: Implement GraphQL query
  return null;
}

// Cart
export async function fetchCart(): Promise<GroceryCart | null> {
  // TODO: Implement GraphQL query
  return null;
}

// Departments (grocery-specific)
export async function fetchDepartments(): Promise<GroceryDepartment[]> {
  // TODO: Implement GraphQL query
  return [];
}

export * from './cart';
export * from './departments';
export * from './products';
export * from './user';
export * from './store';
export * from './lists';
export * from './deals';
export * from './orders';
