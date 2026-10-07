import { getInternalGraphQLEndpoint, getTrustedApplicationOrigin } from '@/features/keystone/lib/internalTransport';

const GRAPHQL_PATH = '/api/graphql';

/**
 * Resolve the storefront origin from browser location or trusted launcher /
 * deployment configuration. Server-side credential-bearing requests never
 * derive their destination from request Host or forwarding headers.
 */
export async function getBaseUrl(): Promise<string> {
  if (typeof window !== 'undefined') return window.location.origin;

  return getTrustedApplicationOrigin();
}

export async function getGraphQLEndpoint(): Promise<string> {
  if (typeof window !== 'undefined') return GRAPHQL_PATH;
  const internalEndpoint = getInternalGraphQLEndpoint();
  if (internalEndpoint) return internalEndpoint;
  return new URL(GRAPHQL_PATH, getTrustedApplicationOrigin()).toString();
}
