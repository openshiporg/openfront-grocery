import { handleDashboardRoutes, getAuthenticatedUser } from '@/features/dashboard/middleware';
import { NextRequest, NextResponse } from 'next/server';

const dashboardPath = '/dashboard';

export async function proxy(request: NextRequest) {
  // Get authenticated user once
  const { user, redirectToInit } = await getAuthenticatedUser(request);

  // Fresh installs should not expose the storefront until the initial admin exists.
  // Match canonical Openfront: any non-init route redirects to dashboard init.
  if (redirectToInit && !request.nextUrl.pathname.startsWith(`${dashboardPath}/init`)) {
    return NextResponse.redirect(new URL(`${dashboardPath}/init`, request.url));
  }

  // Let dashboard handler manage its routes
  const dashboardResponse = await handleDashboardRoutes(request, user, redirectToInit);
  if (dashboardResponse) return dashboardResponse;

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.svg (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.svg).*)',
  ],
};