import { createHash } from 'node:crypto';
import { GraphQLError } from 'graphql';
import { isDangerousAuthOperation, isGraphqlMutation, MAX_GRAPHQL_QUERY_LENGTH, requestIp } from './graphqlSecurity';

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

export async function enforceGraphqlRateLimit({
  prisma,
  headers,
  identity,
  query,
}: {
  prisma: any;
  headers?: Headers;
  identity?: string | null;
  query: string;
}) {
  if (query.length > MAX_GRAPHQL_QUERY_LENGTH) throw new GraphQLError('GraphQL request is too large', { extensions: { code: 'QUERY_TOO_LARGE' } });
  if (!prisma) throw new GraphQLError('Rate limiter unavailable', { extensions: { code: 'RATE_LIMITER_UNAVAILABLE' } });
  const ip = requestIp(headers);
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
