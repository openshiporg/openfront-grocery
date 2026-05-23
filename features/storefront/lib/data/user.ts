import type { GroceryUser } from '../../types';
import { storefrontGraphQL } from './graphql';

function splitName(name?: string | null) {
  if (!name) {
    return { firstName: '', lastName: '' };
  }

  const parts = name.trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
}

export async function getUser(): Promise<GroceryUser | null> {
  try {
    const { data } = await storefrontGraphQL<{
      authenticatedItem?: { id: string; email: string; name?: string | null } | null;
    }>(`
      query GetUser {
        authenticatedItem {
          ... on User {
            id
            email
            name
          }
        }
      }
    `, undefined, { cache: 'no-store' });
    const user = data?.authenticatedItem;

    if (!user) return null;

    const { firstName, lastName } = splitName(user.name);

    return {
      id: user.id,
      email: user.email,
      firstName,
      lastName,
    };
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

export const getAuthenticatedUser = getUser;
