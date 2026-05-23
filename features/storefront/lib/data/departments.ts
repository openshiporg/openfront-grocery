import type { GroceryDepartment, GroceryProduct } from '../../types';
import { getProductsList, type ProductSortOption } from './products';
import { storefrontGraphQL } from './graphql';

export async function getDepartmentsList(
  offset: number = 0,
  limit: number = 10
): Promise<{ departments: GroceryDepartment[] }> {
  try {
    const { data } = await storefrontGraphQL<{ departments: GroceryDepartment[] }>(`
      query GetDepartments($take: Int, $skip: Int) {
        departments(
          take: $take
          skip: $skip
          orderBy: [{ sortOrder: asc }, { name: asc }]
          where: { isActive: { equals: true } }
        ) {
          id
          name
          handle
          description
          imageUrl
          sortOrder
          isActive
          temperatureZone
          productsCount
        }
      }
    `, { take: limit, skip: offset }, { next: { revalidate: 3600 } });
    return { departments: data?.departments || [] };
  } catch (error) {
    console.error('Error fetching departments:', error);
    return { departments: [] };
  }
}

export async function getDepartmentByHandle(
  handle: string
): Promise<GroceryDepartment | null> {
  try {
    const { data } = await storefrontGraphQL<{ departments: GroceryDepartment[] }>(`
      query GetDepartment($handle: String!) {
        departments(where: { handle: { equals: $handle } }) {
          id
          name
          handle
          description
          imageUrl
          sortOrder
          isActive
        }
      }
    `, { handle }, { next: { revalidate: 3600 } });
    return data?.departments?.[0] || null;
  } catch (error) {
    console.error('Error fetching department:', error);
    return null;
  }
}

export async function getProductsByDepartment(
  departmentHandle: string,
  options?: { sortBy?: string; page?: number; limit?: number }
): Promise<{ products: GroceryProduct[]; totalCount: number }> {
  const { sortBy = 'name', page = 1, limit = 20 } = options || {};
  const offset = (page - 1) * limit;

  try {
    const { products, count } = await getProductsList({
      department: departmentHandle,
      sort: sortBy as ProductSortOption,
      limit,
      offset,
    });

    return { products, totalCount: count };
  } catch (error) {
    console.error('Error fetching products by department:', error);
    return { products: [], totalCount: 0 };
  }
}
