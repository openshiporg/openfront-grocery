import type { GroceryUser } from '../../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/graphql';

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
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        query: `
          query GetUser {
            authenticatedItem {
              ... on User {
                id
                email
                name
              }
            }
          }
        `,
      }),
      cache: 'no-store',
    });

    const { data } = await response.json();
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
