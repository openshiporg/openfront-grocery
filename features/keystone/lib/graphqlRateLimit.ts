import { createHash } from 'node:crypto';
import { GraphQLError } from 'graphql';
import { isDangerousAuthOperation, isGraphqlMutation, MAX_GRAPHQL_QUERY_LENGTH, requestIp } from './graphqlSecurity';
import { normalizeClientIp } from './clientIp';

type BucketRow = { requestCount: number };
const WINDOW_MS = 60_000;
const ANONYMOUS_QUERY_LIMIT = 120;
const AUTHENTICATED_QUERY_LIMIT = 600;
const ANONYMOUS_MUTATION_LIMIT = 40;
const AUTHENTICATED_MUTATION_LIMIT = 120;
const AUTH_LIMIT = 8;

export async function consumeSharedBucket(prisma: any, key: string, limit: number) {
  const now = new Date();
  const result = await prisma.$queryRawUnsafe(`
    INSERT INTO "RateLimitBucket" ("id", "key", "windowStartedAt", "requestCount", "createdAt", "updatedAt")
    VALUES (md5($1 || $2::text), $1, $2, 1, $2, $2)
    ON CONFLICT ("key") DO UPDATE SET
      "windowStartedAt" = CASE WHEN EXTRACT(EPOCH FROM ($2 - "RateLimitBucket"."windowStartedAt")) * 1000 >= ${WINDOW_MS} THEN $2 ELSE "RateLimitBucket"."windowStartedAt" END,
      "requestCount" = CASE WHEN EXTRACT(EPOCH FROM ($2 - "RateLimitBucket"."windowStartedAt")) * 1000 >= ${WINDOW_MS} THEN 1 ELSE "RateLimitBucket"."requestCount" + 1 END,
      "updatedAt" = $2
    RETURNING "requestCount"
  `, key, now);
  if (Number(result[0]?.requestCount || 0) > limit) throw new GraphQLError('Too many requests; retry later', { extensions: { code: 'RATE_LIMITED' } });
}

const PRUNE_BATCH = 200;

function isPrivateOrLoopback(ip: string) {
  return /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
    || ip === '::1' || /^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe80:/i.test(ip);
}

/**
 * The requesting actor for abuse controls, when it can be trusted: the signed-in
 * user, the edge-supplied client address when TRUSTED_PROXY=true, or a public
 * socket address. Loopback/private peers (the storefront server, an internal
 * proxy) stand for many shoppers at once, so they are not an actor identity.
 */
export function abuseActor(context: { session?: any; req?: any }): string | null {
  if (context.session?.itemId) return `user:${context.session.itemId}`;
  const req = context.req;
  if (!req) return null;
  const header = (name: string) => {
    const value = typeof req.headers?.get === 'function' ? req.headers.get(name) : req.headers?.[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const ip = process.env.TRUSTED_PROXY === 'true'
    ? normalizeClientIp(header('x-real-ip'))
    : normalizeClientIp(req.socket?.remoteAddress);
  if (!ip || (process.env.TRUSTED_PROXY !== 'true' && isPrivateOrLoopback(ip))) return null;
  return `ip:${ip}`;
}

function bucketKey(action: string, kind: string, value: string) {
  return `${action}:${kind}:${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

/**
 * Abuse control for one anonymous action (sign-up, contact). Limits apply per
 * trusted actor and per target (for example the email being registered) — never
 * one store-wide bucket that a single caller could exhaust for every shopper.
 * The actor bucket is checked first, so a blocked actor allocates no target
 * rows, and finished windows are pruned so changing targets cannot grow the
 * table without bound. Browsing and checkout never call this.
 */
export async function consumeActionBuckets(
  context: { prisma: any; session?: any; req?: any },
  action: string,
  { target, targetLimit, actorLimit }: { target: string; targetLimit: number; actorLimit: number },
) {
  await context.prisma.$executeRawUnsafe(
    `DELETE FROM "RateLimitBucket" WHERE "id" IN (SELECT "id" FROM "RateLimitBucket" WHERE "windowStartedAt" < $1 LIMIT ${PRUNE_BATCH})`,
    new Date(Date.now() - WINDOW_MS),
  );
  const actor = abuseActor(context);
  if (actor) await consumeSharedBucket(context.prisma, bucketKey(action, 'actor', actor), actorLimit);
  await consumeSharedBucket(context.prisma, bucketKey(action, 'target', target), targetLimit);
}

export async function enforceGraphqlRateLimit({
  prisma,
  headers,
  remoteAddress,
  identity,
  query,
}: {
  prisma: any;
  headers?: Headers;
  remoteAddress?: string | null;
  identity?: string | null;
  query: string;
}) {
  if (query.length > MAX_GRAPHQL_QUERY_LENGTH) throw new GraphQLError('GraphQL request is too large', { extensions: { code: 'QUERY_TOO_LARGE' } });
  if (!prisma) throw new GraphQLError('Rate limiter unavailable', { extensions: { code: 'RATE_LIMITER_UNAVAILABLE' } });
  const ip = requestIp(headers, remoteAddress);
  const operationClass = isDangerousAuthOperation(query) ? 'auth' : isGraphqlMutation(query) ? 'mutation' : 'query';
  const limit = operationClass === 'auth'
    ? AUTH_LIMIT
    : operationClass === 'mutation'
      ? (identity ? AUTHENTICATED_MUTATION_LIMIT : ANONYMOUS_MUTATION_LIMIT)
      : (identity ? AUTHENTICATED_QUERY_LIMIT : ANONYMOUS_QUERY_LIMIT);
  const key = createHash('sha256').update(`${ip}:${identity || 'anonymous'}:${operationClass}`).digest('hex');
  await consumeSharedBucket(prisma, key, limit);
}

export function graphqlRateLimitPlugin() {
  return {
    async requestDidStart(requestContext: any) {
      const context = requestContext.contextValue;
      await enforceGraphqlRateLimit({
        prisma: context?.prisma,
        headers: requestContext.request.http?.headers as Headers | undefined,
        identity: context?.session?.itemId,
        query: requestContext.request.query || '',
      });
      return {};
    },
  };
}
