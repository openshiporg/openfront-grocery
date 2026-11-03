import { getGraphQLEndpoint } from '@/features/storefront/lib/getBaseUrl';
import { getInternalGraphQLEndpoint } from '@/features/keystone/lib/internalTransport';
import { applyInternalIdentity } from '@/features/keystone/lib/internal-origin';

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
  const internalEndpoint = getInternalGraphQLEndpoint();
  const endpoint = internalEndpoint || await getGraphQLEndpoint();
  const requestHeaders = new Headers(headers);

  // Server destinations and client identity come from deployment/runtime context, never from
  // caller-supplied Host, forwarding, or unsigned identity headers. The end user's address travels
  // only as a signed identity that the API accepts from a loopback socket.
  for (const name of ['host', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'x-real-ip', 'x-grocery-proxy-identity', 'x-openfront-client-identity', 'x-openfront-client-timestamp', 'x-openfront-client-signature']) {
    requestHeaders.delete(name);
  }
  if (typeof window === 'undefined' && internalEndpoint) {
    const { headers: requestContextHeaders } = await import('next/headers');
    applyInternalIdentity(requestHeaders, await requestContextHeaders());
  }

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
