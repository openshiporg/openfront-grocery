import { keystoneClient as coreKeystoneClient, type KeystoneResponse } from '@/features/dashboard/lib/keystoneClient';

const PROTECTED_INPUT = 'A protected input could not be accepted. Review the form and try again.';

/**
 * Staff-facing text for a GraphQL error from the shared client. The shared client appends
 * "(Path: … | Code: …)" diagnostics to each message; staff see the business message only, and a
 * GraphQL input-coercion message (which can echo submitted values) is never shown.
 */
export function staffErrorMessage(error: string | null | undefined, fallback = 'The request could not be completed. Please try again.') {
  const lines = String(error || '').split('\n')
    .map((line) => line.replace(/\s+\((?:Original Error|Path|Code|Validation): .*\)\s*$/, '').trim())
    .filter(Boolean)
    .map((line) => (/\bvariable\b.*(?:invalid value|\$(?:password|token|secret|sessionId|clientSecret)\b)/i.test(line) ? PROTECTED_INPUT : line));
  const text = [...new Set(lines)].join('\n');
  return !text || /^unexpected error\.?$/i.test(text) ? fallback : text;
}

/** The shared Openfront client with staff-facing error text; same signature and result shape. */
export async function keystoneClient<T = any>(
  query: string,
  variables: Record<string, unknown> = {},
  requestOptions?: RequestInit,
): Promise<KeystoneResponse<T>> {
  const response = await coreKeystoneClient<T>(query, variables, requestOptions);
  return response.success ? response : { ...response, error: staffErrorMessage(response.error) };
}
export type { KeystoneResponse };
