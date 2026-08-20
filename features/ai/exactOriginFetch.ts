type ExactOriginFetchOptions = {
  endpoint: URL;
  cookie: string;
  fetchImpl?: typeof fetch;
};

function requestUrl(input: RequestInfo | URL) {
  if (input instanceof Request) return new URL(input.url);
  return new URL(input.toString());
}

/**
 * Creates a request-scoped fetch for one MCP transport instance.
 * The inbound dashboard cookie is attached only when scheme, host, and port
 * exactly match the configured MCP endpoint. Redirects stay manual so a
 * same-origin request cannot carry that cookie through an external redirect.
 */
export function createExactOriginFetch({
  endpoint,
  cookie,
  fetchImpl = fetch,
}: ExactOriginFetchOptions): typeof fetch {
  const allowedOrigin = endpoint.origin;

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));

    if (cookie && requestUrl(input).origin === allowedOrigin) {
      headers.set('cookie', cookie);
    } else {
      headers.delete('cookie');
    }

    return fetchImpl(input, {
      ...init,
      headers,
      redirect: 'manual',
    });
  }) as typeof fetch;
}
