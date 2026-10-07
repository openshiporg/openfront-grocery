import { boundedReturnPath } from "./lib/boundedReturnPath";
import { trustedClientIp } from "@/features/keystone/lib/clientIp";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getGraphQLEndpoint } from "@/features/dashboard/lib/getBaseUrl";
import { GraphQLClient, ClientError } from 'graphql-request';

const basePath = "/dashboard";

// Create a GraphQL client for middleware with explicit headers
async function createMiddlewareGraphQLClient(headers: Record<string, string>): Promise<GraphQLClient> {
  const endpoint = await getGraphQLEndpoint();
  return new GraphQLClient(endpoint, {
    credentials: 'include',
    headers,
  });
}

// Format GraphQL errors (adapted from dashboard keystoneClient)
function formatGraphQLErrors(error: ClientError): { message: string; errors?: any[] } {
  if (!error.response) {
    return { message: error.message };
  }

  const errors = error.response.errors;
  if (!errors) {
    return { message: error.message };
  }

  const message = errors
    .map((err: any) => err.message)
    .join('\n');

  return { 
    message,
    errors: errors 
  };
}

// Carry only the deployment-trusted Railway client address over the server-side
// GraphQL hop. Arbitrary forwarding and legacy signed-identity headers are ignored.
function middlewareRequestHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = { cookie: request.headers.get('cookie') || '' };
  const clientIp = trustedClientIp(request.headers);
  if (clientIp) headers['x-real-ip'] = clientIp;
  return headers;
}

// Lightweight check for redirectToInit status only
export async function checkInitStatus(request: NextRequest) {
  const query = `
    query redirectToInit {
      redirectToInit
    }
  `;

  const headers = middlewareRequestHeaders(request);

  try {
    const client = await createMiddlewareGraphQLClient(headers);
    const data = await client.request(query) as { redirectToInit: boolean };
    return data.redirectToInit;
  } catch (error) {
    console.error("Error checking init status:", error);
    return false;
  }
}

// Get authenticated user from the request (adapted for dashboard)
export async function getAuthenticatedUser(request: NextRequest) {
  const query = `
    query authenticatedItem {
      authenticatedItem {
        ... on User {
          id
          role {
            canAccessDashboard
          }
        }
      }
      redirectToInit
    }
  `;

  const headers = middlewareRequestHeaders(request);

  try {
    const client = await createMiddlewareGraphQLClient(headers);
    const data = await client.request(query) as { 
      authenticatedItem: any; 
      redirectToInit: boolean 
    };
    
    return {
      status: 'available' as const,
      user: data.authenticatedItem,
      redirectToInit: data.redirectToInit
    };
  } catch (error) {
    // Authentication service failure is distinct from an anonymous visitor.
    // Do not log GraphQL request headers, cookies or provider response bodies.
    return { status: 'unavailable' as const, code: 'AUTH_SERVICE_UNAVAILABLE' as const, user: null, redirectToInit: false };
  }
}

// Handles authentication and access control for dashboard routes
export async function handleDashboardRoutes(
  request: NextRequest, 
  user: any,
  redirectToInit: boolean
) {
  const pathname = request.nextUrl.pathname;
  
  // Only handle dashboard routes
  if (!pathname.startsWith(basePath)) {
    return null;
  }
  
  const isInitRoute = pathname.startsWith(`${basePath}/init`);
  const isSigninRoute = pathname.startsWith(`${basePath}/signin`);
  const isNoAccessRoute = pathname.startsWith(`${basePath}/no-access`);
  const isResetRoute = pathname.startsWith(`${basePath}/reset`);
  const fromPath = request.nextUrl.searchParams.get("from");

  // Handle redirectToInit for dashboard routes
  if (redirectToInit) {
    if (!isInitRoute) {
      return NextResponse.redirect(new URL(`${basePath}/init`, request.url));
    }
    return NextResponse.next();
  }

  // Prevent access to init page if not needed (when redirectToInit is false)
  if (isInitRoute && !redirectToInit) {
    return NextResponse.redirect(new URL(basePath, request.url));
  }

  // Handle unauthenticated users
  if (!user && !isSigninRoute && !isResetRoute) {
    const signinUrl = new URL(`${basePath}/signin`, request.url);
    if (!isNoAccessRoute) {
      signinUrl.searchParams.set("from", request.nextUrl.pathname);
    }
    return NextResponse.redirect(signinUrl);
  }

  // Handle authenticated users trying to access signin
  if (user && (isSigninRoute || isResetRoute)) {
    const returnPath = boundedReturnPath(fromPath);
    if (returnPath) return NextResponse.redirect(new URL(returnPath, request.url));
    return NextResponse.redirect(new URL(basePath, request.url));
  }

  // Check role permissions
  if (user && !isNoAccessRoute && !user.role?.canAccessDashboard) {
    return NextResponse.redirect(new URL(`${basePath}/no-access`, request.url));
  }

  return NextResponse.next();
}
export function authUnavailableResponse(code: string) {
  return NextResponse.json({ error: code, message: 'Sign-in service is temporarily unavailable. Please retry.' }, {status:503,headers:{'Cache-Control':'no-store','Retry-After':'15'}});
}
