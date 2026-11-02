import type { Context } from '.keystone/types';

/**
 * Readiness probe over GraphQL: `{ groceryHealth { status database } }`.
 * Keystone 6.5.1's Prisma extension can resolve a GraphQLError instead of
 * rejecting a failed query, so readiness requires the actual SQL sentinel.
 */
async function groceryHealth(_root: unknown, _args: unknown, context: Context) {
  try {
    const result = await context.prisma.$queryRaw<unknown>`SELECT 1 AS readiness`;
    if (!Array.isArray(result) || result.length !== 1 || result[0]?.readiness !== 1) {
      return { status: 'not_ready', database: 'unavailable' };
    }
    return { status: 'ok', database: 'ok' };
  } catch {
    return { status: 'not_ready', database: 'unavailable' };
  }
}

export default groceryHealth;
