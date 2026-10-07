export function getFreshInstallRootRedirect(
  pathname: string,
  redirectToInit: boolean
): '/dashboard' | null {
  return redirectToInit && pathname === '/' ? '/dashboard' : null;
}
