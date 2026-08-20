export type HeaderReader = Pick<Headers, 'get'>;

function firstHeaderValue(value: string | null) {
  return value?.split(',')[0]?.trim() || null;
}

function validatedOrigin(value: string, label: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${label} must use credential-free HTTP or HTTPS`);
  }
  return url.origin;
}

export function resolveApplicationOrigin({
  headers,
  nodeEnv = process.env.NODE_ENV,
  canonicalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL,
  port = process.env.PORT,
}: {
  headers?: HeaderReader | null;
  nodeEnv?: string;
  canonicalSiteUrl?: string;
  port?: string;
} = {}) {
  if (nodeEnv === 'production') {
    if (!canonicalSiteUrl?.trim()) throw new Error('NEXT_PUBLIC_SITE_URL is required in production');
    const origin = validatedOrigin(canonicalSiteUrl.trim(), 'NEXT_PUBLIC_SITE_URL');
    if (!origin.startsWith('https://')) throw new Error('NEXT_PUBLIC_SITE_URL must use HTTPS in production');
    return origin;
  }

  const host = firstHeaderValue(headers?.get('x-forwarded-host') || headers?.get('host') || null);
  if (host) {
    const forwardedProtocol = firstHeaderValue(headers?.get('x-forwarded-proto') || null)?.toLowerCase();
    const localHost = host === 'localhost' || host.startsWith('localhost:') || host === '127.0.0.1' || host.startsWith('127.0.0.1:') || host === '[::1]' || host.startsWith('[::1]:');
    const protocol = forwardedProtocol || (localHost ? 'http' : 'https');
    if (protocol !== 'http' && protocol !== 'https') throw new Error('Forwarded application protocol must be HTTP or HTTPS');
    return validatedOrigin(`${protocol}://${host}`, 'Request origin');
  }

  const fallbackPort = port?.trim() || '3000';
  if (!/^\d+$/.test(fallbackPort)) throw new Error('PORT must be numeric');
  return `http://localhost:${fallbackPort}`;
}
