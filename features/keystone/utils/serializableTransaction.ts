import { throwKeystonePrismaErrors } from '../lib/keystonePrismaErrors';

export function requirePrismaSuccess<T>(value: T, operation = 'database operation'): T {
  const extensions = (value as any)?.extensions;
  if (extensions?.code !== 'KS_PRISMA_ERROR') return value;
  const prismaCode = extensions.prisma?.code;
  const sqlState = extensions.prisma?.meta?.code;
  const error = new Error(`Keystone Prisma ${operation} failed`);
  if (prismaCode) (error as Error & { code?: string }).code = prismaCode;
  if (typeof sqlState === 'string' && /^[0-9A-Z]{5}$/.test(sqlState)) (error as Error & { sqlState?: string }).sqlState = sqlState;
  throw error;
}

/**
 * Interactive-transaction limits. Prisma's defaults (5s run, 2s wait for a
 * connection) are shorter than a cart or checkout transaction takes against a
 * remote database under load. When a transaction outlives its limit, every later
 * read inside it comes back from Keystone as an error value rather than a thrown
 * error, which then surfaces as unrelated validation failures (for example an
 * "invalid" store tax rate). Explicit per-call options still win.
 */
export const INTERACTIVE_TRANSACTION_DEFAULTS = { timeout: 20_000, maxWait: 10_000 } as const;

export function withInteractiveTransactionDefaults<T extends object>(prisma: T, defaults: { timeout?: number; maxWait?: number } = INTERACTIVE_TRANSACTION_DEFAULTS): T {
  return new Proxy(prisma, {
    get(target, key, receiver) {
      if (key === '$transaction') {
        const transaction = Reflect.get(target, key, receiver) as (...args: any[]) => unknown;
        return (arg: unknown, options?: Record<string, unknown>) => typeof arg === 'function'
          ? transaction.call(target, arg, { ...defaults, ...options })
          : transaction.call(target, arg, options);
      }
      return Reflect.get(target, key, receiver);
    },
  });
}

/**
 * Normalize Keystone's Prisma-error values at the client boundary. Keystone's own
 * error-to-value extension runs outside any app-level `$extends`, so the query
 * extension below never sees those values; throwKeystonePrismaErrors wraps the
 * client (and every transaction client) so they are thrown and the transaction
 * rolls back.
 */
export function extendPrismaClientWithErrorNormalization(prisma: any) {
  return withInteractiveTransactionDefaults(throwKeystonePrismaErrors(prisma.$extends({
    query: {
      async $allOperations({ model, operation, args, query }: any) {
        const label = [model, operation].filter((part) => typeof part === 'string' && part).join('.') || 'database operation';
        return requirePrismaSuccess(await query(args), label);
      },
    },
  })));
}

export function isSerializableConflict(error: unknown) {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: string; sqlState?: string; meta?: { code?: string }; message?: string };
  const sqlState = candidate.sqlState || candidate.meta?.code;
  return candidate.code === 'P2034' || candidate.code === 'P2002' || sqlState === '40001' || sqlState === '40P01' || /serialization|write conflict|deadlock|unique constraint/i.test(candidate.message || '');
}

export async function withSerializableRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return requirePrismaSuccess(await operation(), 'transaction');
    } catch (error) {
      lastError = error;
      if (!isSerializableConflict(error) || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 10));
    }
  }

  throw lastError;
}
