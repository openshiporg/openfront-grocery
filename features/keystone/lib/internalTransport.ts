import { resolveApplicationOrigin } from '@/lib/applicationOrigin';

// Plain Next owns both public requests and server-side GraphQL hops. PORT is
// deployment configuration, not request input; a server hop uses that same
// listener over loopback and never follows Host/forwarding headers.
export function getInternalGraphQLEndpoint(): string | null {
  if (typeof window !== 'undefined') return null;
  const configuredPort = process.env.PORT?.trim();
  if (!configuredPort) return null;
  if (!/^\d+$/.test(configuredPort)) throw new Error('PORT must be numeric');
  const port = Number(configuredPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
  return `http://127.0.0.1:${port}/api/graphql`;
}

// Fixed deployment configuration is the only server-side fallback. In
// development resolveApplicationOrigin({ headers: null }) uses localhost and
// PORT; in production it requires the explicitly configured HTTPS site URL.
export function getTrustedApplicationOrigin(): string {
  const internalEndpoint = getInternalGraphQLEndpoint();
  if (internalEndpoint) return new URL(internalEndpoint).origin;
  return resolveApplicationOrigin({
    headers: null,
    nodeEnv: process.env.NODE_ENV,
    canonicalSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    port: process.env.PORT,
  });
}
