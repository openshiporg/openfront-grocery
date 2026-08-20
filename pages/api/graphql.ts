import { GraphQLError, print } from 'graphql';
import { createYoga } from 'graphql-yoga';
// @ts-ignore graphql-upload does not publish declarations for this subpath.
import processRequest from 'graphql-upload/processRequest.js';
import type { NextApiRequest, NextApiResponse } from 'next';

import { keystoneContext } from '../../features/keystone/context';
import { enforceGraphqlRateLimit } from '../../features/keystone/lib/graphqlRateLimit';
import {
  boundedGraphqlDepthRule,
  MAX_GRAPHQL_QUERY_LENGTH,
  rejectIntrospectionInProduction,
} from '../../features/keystone/lib/graphqlSecurity';
import { getCanonicalSiteUrl, isProduction } from '../../features/keystone/lib/runtimeConfig';
import { resolveApplicationOrigin } from '../../lib/applicationOrigin';

const MAX_BODY_BYTES = 1024 * 1024;

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readBoundedGraphqlBody(req: NextApiRequest, contentType: string) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (contentType.startsWith('application/graphql')) return { query: raw };
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function requestHeaders(req: NextApiRequest) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const contentLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return res.status(413).json({ errors: [{ message: 'GraphQL request body exceeds 1 MB' }] });
  }

  const contentType = req.headers['content-type'] || '';
  if (contentType.startsWith('multipart/form-data')) {
    req.body = await processRequest(req, res, {
      maxFieldSize: MAX_GRAPHQL_QUERY_LENGTH,
      maxFileSize: MAX_BODY_BYTES,
      maxFiles: 5,
    });
  } else if (req.method === 'POST' && (contentType.startsWith('application/json') || contentType.startsWith('application/graphql'))) {
    try {
      req.body = await readBoundedGraphqlBody(req, contentType);
    } catch (error) {
      if ((error as Error).message === 'BODY_TOO_LARGE') return res.status(413).json({ errors: [{ message: 'GraphQL request body exceeds 1 MB' }] });
      return res.status(400).json({ errors: [{ message: 'GraphQL request body must be valid JSON' }] });
    }
  }

  const headers = requestHeaders(req);
  const production = isProduction();
  const canonicalOrigin = production
    ? getCanonicalSiteUrl()
    : resolveApplicationOrigin({ headers, nodeEnv: 'development' });

  const yoga = createYoga({
    graphqlEndpoint: '/api/graphql',
    schema: keystoneContext.graphql.schema,
    context: ({ req: yogaReq, res: yogaRes }: { req: any; res: any }) => keystoneContext.withRequest(yogaReq, yogaRes),
    cors: { origin: canonicalOrigin, credentials: true },
    graphiql: !production,
    landingPage: false,
    maskedErrors: production,
    batching: { limit: 5 },
    multipart: false,
    plugins: [{
      onRequestParse({ setRequestParser }: any) {
        if (req.body !== undefined) setRequestParser(async () => req.body);
      },
      onValidate({ addValidationRule }: any) {
        addValidationRule(boundedGraphqlDepthRule);
        addValidationRule(rejectIntrospectionInProduction);
      },
      onParams({ params }: any) {
        const query = typeof params?.query === 'string' ? params.query : '';
        if (query.length > MAX_GRAPHQL_QUERY_LENGTH) {
          throw new GraphQLError('GraphQL request is too large', { extensions: { code: 'QUERY_TOO_LARGE' } });
        }
      },
      async onExecute({ args }: any) {
        await enforceGraphqlRateLimit({
          prisma: args.contextValue?.prisma,
          headers,
          identity: args.contextValue?.session?.itemId,
          query: print(args.document),
        });
      },
    }],
  });

  return yoga(req, res);
}
