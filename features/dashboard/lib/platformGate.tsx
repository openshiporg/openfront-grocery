import { notFound } from 'next/navigation'
import type { ComponentType } from 'react'
import { getAuthenticatedUser } from '@/features/dashboard/actions'
import { groceryPlatformNavItems } from '@/features/platform/lib/navigation'

/**
 * Wrap a /dashboard/platform/<slug> page so a role whose capability for that page
 * is explicitly false gets a 404 (the same capability the sidebar hides it by).
 * An unknown user or capability is left to the middleware and the page's own checks.
 */
export function gatePlatformPage<P extends object>(slug: string, Page: ComponentType<P> | ((props: P) => any)) {
  const item = groceryPlatformNavItems.find((entry) => entry.href === `/platform/${slug}`)
  return async function GatedPlatformPage(props: P) {
    if (item) {
      const response = await getAuthenticatedUser()
      const role = response.success ? (response.data as any)?.authenticatedItem?.role : null
      if (role && role[item.capability] === false) notFound()
    }
    const Component = Page as any
    return <Component {...props} />
  }
}
