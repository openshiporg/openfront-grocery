const GRAPHQL_PATH = '/api/graphql';

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function normalizePath(value: string) {
  return value.startsWith('/') ? value : `/${value}`;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, '');
}

function getConfiguredBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL;

  return configured && isAbsoluteUrl(configured)
    ? trimTrailingSlash(configured)
    : null;
}

/**
 * Resolve the current app origin for storefront data calls.
 *
 * Browser requests can use the current window origin. Server components and
 * React Query prefetches need an absolute URL because Node fetch cannot parse
 * relative paths such as `/api/graphql`.
 */
export async function getBaseUrl(): Promise<string> {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  const configuredBaseUrl = getConfiguredBaseUrl();
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  try {
    const { headers } = await import('next/headers');
    const headersList = await headers();
    const host = headersList.get('x-forwarded-host') || headersList.get('host');

    if (host) {
      const forwardedProtocol = headersList.get('x-forwarded-proto');
      const protocol = forwardedProtocol || (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
      return `${protocol}://${host}`;
    }
  } catch {
    // headers() is unavailable outside App Router request scope. Fall through
    // to a local absolute URL instead of returning a relative path on server.
  }

  return `http://localhost:${process.env.PORT || '3000'}`;
}

/**
 * Resolve the GraphQL endpoint for both browser and server storefront calls.
 *
 * NEXT_PUBLIC_API_URL remains supported as an endpoint override. If it is a
 * relative path, browser calls keep the relative URL while server calls are
 * expanded against the current app origin.
 */
export async function getGraphQLEndpoint(): Promise<string> {
  const configuredEndpoint = process.env.NEXT_PUBLIC_API_URL;

  if (configuredEndpoint) {
    if (isAbsoluteUrl(configuredEndpoint)) {
      return configuredEndpoint;
    }

    const endpointPath = normalizePath(configuredEndpoint);

    if (typeof window !== 'undefined') {
      return endpointPath;
    }

    return new URL(endpointPath, await getBaseUrl()).toString();
  }

  if (typeof window !== 'undefined') {
    return GRAPHQL_PATH;
  }

  return new URL(GRAPHQL_PATH, await getBaseUrl()).toString();
}
