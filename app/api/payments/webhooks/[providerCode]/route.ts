import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { consumeSharedBucket } from '@/features/keystone/lib/graphqlRateLimit';
import { normalizeClientIp } from '@/features/keystone/lib/clientIp';

import { processPaymentProviderWebhook } from '@/features/keystone/mutations/handlePaymentProviderWebhook';
import { keystoneContext } from '@/features/keystone/context';

export const dynamic = 'force-dynamic';

const MAX_WEBHOOK_BYTES = 256_000;
const INVALID_SIGNATURES_PER_SENDER = 30;

/**
 * Read the body as raw bytes, stopping as soon as the cap is crossed — a
 * missing or false Content-Length cannot make the route buffer more than the
 * cap. The exact received bytes are what the signature is verified against.
 */
async function readBoundedBody(request: NextRequest): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_WEBHOOK_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

/**
 * Invalid signatures are throttled per trustworthy sender only (the edge-set
 * address behind TRUSTED_PROXY). Authentic callbacks never spend a shared quota,
 * so forged traffic cannot lock the real provider out; senders without a
 * trustworthy address are not throttled here at all.
 */
function invalidSignatureKey(request: NextRequest, providerCode: string) {
  if (process.env.TRUSTED_PROXY !== 'true') return null;
  const ip = normalizeClientIp(request.headers.get('x-real-ip'));
  return ip ? createHash('sha256').update(`webhook-invalid:${providerCode}:${ip}`).digest('hex') : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerCode: string }> }
) {
  const { providerCode } = await params;

  if (!/^pp_[a-zA-Z0-9-_]+$/.test(providerCode)) {
    return NextResponse.json(
      {
        success: false,
        providerCode,
        message: 'Invalid payment provider code',
      },
      { status: 400 }
    );
  }

  // Content-Length is only an early hint; the stream itself is bounded below.
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_WEBHOOK_BYTES) return NextResponse.json({ success: false, message: 'Webhook body is too large' }, { status: 413 });
  const rawBody = await readBoundedBody(request);
  if (rawBody === null) return NextResponse.json({ success: false, message: 'Webhook body is too large' }, { status: 413 });
  try {
    const headers = Object.fromEntries(request.headers.entries());

    const result = await processPaymentProviderWebhook(
      { providerCode, rawBody, headers },
      keystoneContext
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payment webhook failed';
    if (/signature is invalid/i.test(message)) {
      const key = invalidSignatureKey(request, providerCode);
      if (key) {
        try {
          await consumeSharedBucket(keystoneContext.prisma, key, INVALID_SIGNATURES_PER_SENDER);
        } catch {
          return NextResponse.json({ success: false, providerCode, message: 'Too many invalid webhook requests' }, { status: 429 });
        }
      }
    }
    return NextResponse.json(
      {
        success: false,
        providerCode,
        message,
      },
      { status: 400 }
    );
  }
}
