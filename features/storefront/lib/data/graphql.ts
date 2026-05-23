import { getGraphQLEndpoint } from '@/features/storefront/lib/getBaseUrl';

export type StorefrontGraphQLRequestOptions = Omit<RequestInit, 'method' | 'headers' | 'body'> & {
  headers?: HeadersInit;
};

export interface StorefrontGraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

async function getServerCookieHeader() {
  if (typeof window !== 'undefined') {
    return null;
  }

  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');

    return cookieHeader || null;
  } catch {
    return null;
  }
}

/**
 * Fetch the grocery GraphQL API with an endpoint that is relative in the
 * browser and absolute on the server. This keeps client components compatible
 * with React Query/browser fetch while avoiding Node's "Failed to parse URL
 * from /api/graphql" in server components and hydration prefetches.
 */
export async function storefrontGraphQL<T = any>(
  query: string,
  variables?: Record<string, unknown>,
  options: StorefrontGraphQLRequestOptions = {}
): Promise<StorefrontGraphQLResponse<T>> {
  const { headers, ...requestOptions } = options;
  const endpoint = await getGraphQLEndpoint();
  const requestHeaders = new Headers(headers);

  if (!requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  if (!requestHeaders.has('Cookie')) {
    const cookieHeader = await getServerCookieHeader();
    if (cookieHeader) {
      requestHeaders.set('Cookie', cookieHeader);
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: requestHeaders,
    credentials: 'include',
    body: JSON.stringify({ query, variables }),
    ...requestOptions,
  });

  return response.json();
}

export function throwGraphQLErrors(errors?: Array<{ message?: string }>) {
  if (errors?.length) {
    throw new Error(errors.map((error) => error.message || 'GraphQL request failed').join('\n'));
  }
}
