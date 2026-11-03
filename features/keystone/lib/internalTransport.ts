import { resolveApplicationOrigin } from '@/lib/applicationOrigin';
import { internalGraphqlEndpoint } from './internal-origin';

// Plain Next owns both public requests and server-side GraphQL hops. PORT is
// deployment configuration, not request input; a server hop uses that same
// listener over loopback and never follows Host/forwarding headers.
export function getInternalGraphQLEndpoint(): string | null {
  if (typeof window !== 'undefined') return null;
  // One loopback resolver for the whole app: invalid PORT means "not available", never a throw.
  return internalGraphqlEndpoint();
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
