import { getFreshInstallRootRedirect } from "./features/platform/routing/freshInstall";
import { handleDashboardRoutes, getAuthenticatedUser, authUnavailableResponse } from '@/features/dashboard/middleware';
import { NextRequest, NextResponse } from 'next/server';

const dashboardPath = '/dashboard';

export async function proxy(request: NextRequest) {
  const authState = await getAuthenticatedUser(request);
  if (authState.status === 'unavailable') return authUnavailableResponse(authState.code);
  const { user, redirectToInit } = authState;
  const freshInstallRootRedirect = getFreshInstallRootRedirect(request.nextUrl.pathname, redirectToInit);
  if (freshInstallRootRedirect) return NextResponse.redirect(new URL(freshInstallRootRedirect, request.url));

  // Let dashboard handler manage its routes
  const dashboardResponse = await handleDashboardRoutes(request, user, redirectToInit);
  if (dashboardResponse) return dashboardResponse;
  if (redirectToInit) return NextResponse.redirect(new URL(`${dashboardPath}/init`, request.url));

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
     * - logo.svg and top-level /images image files (public assets, not auth queries)
     * - manifest.webmanifest (public metadata, including before owner bootstrap)
     */
    '/((?!api|_next/static|_next/image|favicon.svg|logo\\.svg$|images/[^/]+\\.(?:jpg|jpeg|png|webp|avif|gif|svg)$|manifest\\.webmanifest$).*)',
  ],
};