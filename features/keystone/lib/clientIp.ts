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
