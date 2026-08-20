import { resolveApplicationOrigin } from '@/lib/applicationOrigin';

const GRAPHQL_PATH = '/api/graphql';

/**
 * Resolve the storefront origin from the live request. Portless development
 * needs no URL-specific environment variable: browser calls stay relative and
 * server calls follow the verified forwarded Host/protocol supplied by the
 * local proxy. Production remains pinned to NEXT_PUBLIC_SITE_URL.
 */
export async function getBaseUrl(): Promise<string> {
  if (typeof window !== 'undefined') return window.location.origin;

  try {
    const { headers } = await import('next/headers');
    return resolveApplicationOrigin({ headers: await headers() });
  } catch (error) {
    if (process.env.NODE_ENV === 'production') throw error;
    return resolveApplicationOrigin({ headers: null });
  }
}

export async function getGraphQLEndpoint(): Promise<string> {
  if (typeof window !== 'undefined') return GRAPHQL_PATH;
  return new URL(GRAPHQL_PATH, await getBaseUrl()).toString();
}
