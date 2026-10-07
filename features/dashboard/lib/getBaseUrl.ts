import { getInternalGraphQLEndpoint, getTrustedApplicationOrigin } from '@/features/keystone/lib/internalTransport';

/**
 * Resolve the browser origin in clients and the deployment-configured origin on servers.
 */

export async function getBaseUrl(): Promise<string> {
  // Client-side: use window.location
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  // Server-side destinations must come from deployment configuration,
  // never from the current request's Host or forwarding headers.
  return getTrustedApplicationOrigin();
}

/**
 * Get the GraphQL endpoint URL
 */
export async function getGraphQLEndpoint(): Promise<string> {
  if (typeof window !== 'undefined') return new URL('/api/graphql', window.location.origin).toString();
  const internalEndpoint = getInternalGraphQLEndpoint();
  if (internalEndpoint) return internalEndpoint;
  return new URL('/api/graphql', getTrustedApplicationOrigin()).toString();
}