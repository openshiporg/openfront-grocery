// The GraphQL route spends a rate-limit bucket per executed operation; sign-in gets 8 per minute.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { parse } from 'graphql';

import { graphqlRateLimitPlugin } from '../features/keystone/lib/graphqlRateLimit';

const route = fs.readFileSync(new URL('../pages/api/graphql.ts', import.meta.url), 'utf8');

test('pages/api/graphql.ts registers graphqlRateLimitPlugin', () => {
  assert.match(route, /import \{ graphqlRateLimitPlugin \} from '..\/..\/features\/keystone\/lib\/graphqlRateLimit'/);
  assert.match(route, /\}, graphqlRateLimitPlugin\(\)\],/);
});

// In-memory stand-in for the RateLimitBucket upsert (same windowing semantics for one window).
function fakePrisma() {
  const counts = new Map<string, number>();
  return {
    counts,
    async $queryRawUnsafe(_sql: string, key: string) {
      const next = (counts.get(key) || 0) + 1;
      counts.set(key, next);
      return [{ requestCount: next }];
    },
  };
}

const SIGN_IN = parse('mutation { authenticateUserWithPassword(email: "qa@example.com", password: "x") { __typename } }');
const QUERY = parse('{ products { id } }');

async function run(plugin: any, prisma: any, document: any, remoteAddress = '203.0.113.9') {
  await plugin.onExecute({ args: { document, contextValue: { prisma, req: { headers: {}, socket: { remoteAddress } } } } });
}

test('the 9th sign-in in a window is refused with RATE_LIMITED; 1-8 pass', async () => {
  const plugin = graphqlRateLimitPlugin();
  const prisma = fakePrisma();
  for (let i = 1; i <= 8; i++) await run(plugin, prisma, SIGN_IN);
  await assert.rejects(run(plugin, prisma, SIGN_IN), (e: any) => e.extensions?.code === 'RATE_LIMITED');
});

test('sign-in buckets are per caller, and separate from ordinary queries', async () => {
  const plugin = graphqlRateLimitPlugin();
  const prisma = fakePrisma();
  for (let i = 1; i <= 8; i++) await run(plugin, prisma, SIGN_IN, '203.0.113.9');
  await run(plugin, prisma, SIGN_IN, '203.0.113.10');
  for (let i = 1; i <= 20; i++) await run(plugin, prisma, QUERY, '203.0.113.9');
});

test('no prisma means fail closed', async () => {
  const plugin = graphqlRateLimitPlugin();
  await assert.rejects(plugin.onExecute({ args: { document: SIGN_IN, contextValue: { req: { headers: {} } } } }), /Rate limiter unavailable/);
});
