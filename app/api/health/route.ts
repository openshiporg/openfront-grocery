import { keystoneContext } from '@/features/keystone/context';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    // Keystone 6.5.1's Prisma extension can resolve a GraphQLError instead of
    // rejecting a failed query. Readiness requires the actual SQL sentinel.
    const result = await keystoneContext.prisma.$queryRaw<unknown>`SELECT 1 AS readiness`;
    if (!Array.isArray(result) || result.length !== 1 || result[0]?.readiness !== 1) {
      return Response.json({ status: 'not_ready', database: 'unavailable' }, { status: 503, headers });
    }
    return Response.json({ status: 'ok', database: 'ok' }, { headers });
  } catch {
    return Response.json({ status: 'not_ready', database: 'unavailable' }, { status: 503, headers });
  }
}
