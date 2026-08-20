import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { consumeSharedBucket } from '@/features/keystone/lib/graphqlRateLimit';
import { requestIp } from '@/features/keystone/lib/graphqlSecurity';

import { processPaymentProviderWebhook } from '@/features/keystone/mutations/handlePaymentProviderWebhook';
import { keystoneContext } from '@/features/keystone/context';

export const dynamic = 'force-dynamic';

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

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 256_000) return NextResponse.json({ success: false, message: 'Webhook body is too large' }, { status: 413 });
  try {
    const ip = requestIp(request.headers);
    const key = createHash('sha256').update(`webhook:${providerCode}:${ip}`).digest('hex');
    await consumeSharedBucket(keystoneContext.prisma, key, 120);
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > 256_000) return NextResponse.json({ success: false, message: 'Webhook body is too large' }, { status: 413 });
    const headers = Object.fromEntries(request.headers.entries());

    const result = await processPaymentProviderWebhook(
      { providerCode, rawBody, headers },
      keystoneContext
    );

    return NextResponse.json(result);
  } catch (error) {
    const code = (error as any)?.extensions?.code;
    return NextResponse.json(
      {
        success: false,
        providerCode,
        message: error instanceof Error ? error.message : 'Payment webhook failed',
      },
      { status: code === 'RATE_LIMITED' ? 429 : 400 }
    );
  }
}
