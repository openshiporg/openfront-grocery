import { createServer, type IncomingMessage } from 'node:http';
import { signProxyIdentity } from '../features/keystone/lib/proxyIdentity';

const listenPort = Number(process.env.PORT || 8080);
const upstream = process.env.GROCERY_UPSTREAM_URL?.trim();
const secret = process.env.TRUSTED_PROXY_IDENTITY_SECRET?.trim();
const canonicalOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
if (!upstream || !secret || !canonicalOrigin) throw new Error('GROCERY_UPSTREAM_URL, TRUSTED_PROXY_IDENTITY_SECRET, and NEXT_PUBLIC_SITE_URL are required');
const upstreamUrl = new URL(upstream);
const publicUrl = new URL(canonicalOrigin);
if (!['http:', 'https:'].includes(upstreamUrl.protocol)) throw new Error('GROCERY_UPSTREAM_URL must use HTTP or HTTPS');

function boundedInteger(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  return value;
}

const maxBodyBytes = boundedInteger('INGRESS_MAX_BODY_BYTES', 10 * 1024 * 1024, 1, 25 * 1024 * 1024);
const maxRequestsPerMinute = boundedInteger('INGRESS_REQUESTS_PER_MINUTE', 600, 1, 10_000);
const upstreamTimeoutMs = boundedInteger('INGRESS_UPSTREAM_TIMEOUT_MS', 30_000, 1_000, 120_000);
const stripped = new Set([
  'host', 'content-length', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade',
  'x-grocery-proxy-identity', 'x-real-ip', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded',
]);
const trustRailwayEdge = process.env.TRUST_RAILWAY_EDGE === 'true';
if (process.env.RAILWAY_ENVIRONMENT && !trustRailwayEdge) throw new Error('TRUST_RAILWAY_EDGE=true is required on Railway public ingress');
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

class IngressError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function claimRequest(peer: string) {
  const now = Date.now();
  const current = requestBuckets.get(peer);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : current;
  bucket.count += 1;
  requestBuckets.set(peer, bucket);
  if (bucket.count > maxRequestsPerMinute) throw new IngressError(429, 'Too many requests; retry later');
  if (requestBuckets.size > 10_000) for (const [key, value] of requestBuckets) if (value.resetAt <= now) requestBuckets.delete(key);
}

function verifiedClientIp(request: IncomingMessage) {
  if (trustRailwayEdge) {
    const railwayIp = request.headers['x-real-ip'];
    const value = (Array.isArray(railwayIp) ? railwayIp[0] : railwayIp || '').trim();
    if (!value || value.includes(',') || value.length > 64 || !/^[0-9a-fA-F:.]+$/.test(value)) {
      throw new IngressError(400, 'Railway edge did not provide a valid X-Real-IP client address');
    }
    return value.replace(/^::ffff:/, '');
  }
  const peer = request.socket.remoteAddress?.replace(/^::ffff:/, '');
  if (!peer) throw new IngressError(400, 'Ingress could not resolve verified peer address');
  return peer;
}

const server = createServer(async (request, response) => {
  try {
    const peer = verifiedClientIp(request);
    claimRequest(peer);
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (stripped.has(name.toLowerCase()) || value === undefined) continue;
      headers.set(name, Array.isArray(value) ? value.join(',') : value);
    }
    headers.set('host', publicUrl.host);
    headers.set('x-forwarded-host', publicUrl.host);
    headers.set('x-forwarded-proto', publicUrl.protocol.slice(0, -1));
    headers.set('x-grocery-proxy-identity', signProxyIdentity(peer, secret));
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : Buffer.from(await readBody(request, maxBodyBytes));
    const requestedPath = new URL(request.url || '/', 'http://ingress.invalid');
    const target = new URL(upstreamUrl);
    target.pathname = requestedPath.pathname;
    target.search = requestedPath.search;
    const upstreamResponse = await fetch(target, { method: request.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(upstreamTimeoutMs) });
    const responseHeaders = new Headers(upstreamResponse.headers);
    for (const name of stripped) responseHeaders.delete(name);
    const location = responseHeaders.get('location');
    if (location) {
      const resolved = new URL(location, upstreamUrl);
      if (resolved.origin === upstreamUrl.origin) {
        responseHeaders.set('location', new URL(`${resolved.pathname}${resolved.search}${resolved.hash}`, publicUrl).toString());
      }
    }
    const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
    response.writeHead(upstreamResponse.status, Object.fromEntries(responseHeaders));
    response.end(responseBody);
  } catch (error) {
    const status = error instanceof IngressError ? error.status : error instanceof DOMException && error.name === 'TimeoutError' ? 504 : 502;
    response.statusCode = status;
    response.setHeader('content-type', 'text/plain; charset=utf-8');
    response.end(error instanceof IngressError ? error.message : status === 504 ? 'Upstream request timed out' : 'Ingress proxy failure');
  }
});

function readBody(request: IncomingMessage, limit: number) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const declaredLength = Number(request.headers['content-length'] || 0);
    if (Number.isFinite(declaredLength) && declaredLength > limit) {
      request.resume();
      reject(new IngressError(413, 'Request body is too large'));
      return;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    request.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > limit) {
        request.removeAllListeners('data');
        request.resume();
        reject(new IngressError(413, 'Request body is too large'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

server.requestTimeout = upstreamTimeoutMs + 5_000;
server.headersTimeout = Math.min(60_000, upstreamTimeoutMs + 10_000);
server.listen(listenPort, '0.0.0.0', () => console.log(`Grocery ingress listening on ${listenPort}, upstream ${upstreamUrl.origin}`));
