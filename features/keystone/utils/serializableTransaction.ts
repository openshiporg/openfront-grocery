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

/** Normalize Keystone's Prisma-error values at the client boundary, including transaction clients. */
export function extendPrismaClientWithErrorNormalization(prisma: any) {
  return prisma.$extends({
    query: {
      async $allOperations({ model, operation, args, query }: any) {
        const label = [model, operation].filter((part) => typeof part === 'string' && part).join('.') || 'database operation';
        return requirePrismaSuccess(await query(args), label);
      },
    },
  });
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
