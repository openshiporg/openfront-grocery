import { keystoneContext } from '@/features/keystone/context';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await keystoneContext.prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', database: 'ok' });
  } catch {
    return Response.json({ status: 'not_ready', database: 'unavailable' }, { status: 503 });
  }
}
