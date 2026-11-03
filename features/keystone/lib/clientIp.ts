import { isIP } from 'node:net';

export function normalizeClientIp(value: string | null | undefined): string | null {
  const candidate = value?.trim() || '';
  if (!candidate || candidate.length > 64 || candidate.includes(',') || isIP(candidate) === 0) return null;
  const ipv4Mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(candidate);
  return ipv4Mapped?.[1] || candidate.toLowerCase();
}

/**
 * Railway's HTTP edge overwrites X-Real-IP before forwarding to the app. Only
 * propagate that value when deployment configuration explicitly trusts the
 * edge; never promote X-Forwarded-For or a caller-supplied signed identity.
 */
export function trustedClientIp(headers: Pick<Headers, 'get'>): string | null {
  if (process.env.TRUSTED_PROXY !== 'true') return null;
  return normalizeClientIp(headers.get('x-real-ip'));
}

function isLoopbackPeer(peer: string | null) {
  return !peer || /^127\./.test(peer) || peer === '::1';
}

/**
 * Railway's HTTP edge overwrites X-Real-IP, but only traffic that came through the edge
 * carries it: on Railway (RAILWAY_ENVIRONMENT, set by the platform) with TRUSTED_PROXY=true,
 * and only from a non-loopback peer. A loopback caller is this app's own server and must
 * use the signed internal identity; its X-Real-IP is never trusted. XFF is never used.
 */
export function edgeClientIp(getHeader: (name: string) => string | null | undefined, peer: string | null | undefined): string | null {
  if (process.env.TRUSTED_PROXY !== 'true' || !process.env.RAILWAY_ENVIRONMENT) return null;
  if (isLoopbackPeer(normalizeClientIp(peer))) return null;
  return normalizeClientIp(getHeader('x-real-ip'));
}

/** True when the request reached the app through the Railway edge (as above), header or not. */
export function viaRailwayEdge(peer: string | null | undefined): boolean {
  return process.env.TRUSTED_PROXY === 'true' && Boolean(process.env.RAILWAY_ENVIRONMENT) && !isLoopbackPeer(normalizeClientIp(peer));
}
