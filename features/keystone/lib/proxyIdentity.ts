import { createHmac, timingSafeEqual } from 'node:crypto';

export type ProxyIdentityPayload = { version: 1; ip: string; issuedAt: number };

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function normalizeIp(ip: string) {
  const trimmed = ip.trim();
  return trimmed.startsWith('::ffff:') ? trimmed.slice('::ffff:'.length) : trimmed;
}

export function signProxyIdentity(ip: string, secret: string, issuedAt = Math.floor(Date.now() / 1000)) {
  const payload: ProxyIdentityPayload = { version: 1, ip: normalizeIp(ip), issuedAt };
  const encoded = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(`v1.${encoded}`).digest('base64url');
  return `v1.${encoded}.${signature}`;
}

export function verifyProxyIdentity(value: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = value.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'v1' || !parts[1] || !parts[2]) return null;
  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (parts[2].length !== expected.length || !timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) return null;
  let payload: ProxyIdentityPayload;
  try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
  if (payload?.version !== 1 || typeof payload.ip !== 'string' || !payload.ip || !Number.isInteger(payload.issuedAt)) return null;
  if (Math.abs(nowSeconds - payload.issuedAt) > 60) return null;
  return { ...payload, ip: normalizeIp(payload.ip) };
}
