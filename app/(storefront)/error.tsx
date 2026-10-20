'use client';
import { UrbanButton, UrbanButtonLink, UrbanContainer, UrbanPageShell } from '@/features/storefront/modules/urban/UrbanPrimitives';
export default function StorefrontError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <UrbanPageShell><UrbanContainer className="py-12 sm:py-20"><div className="sf-panel mx-auto max-w-xl space-y-4 p-6 sm:p-9">
    <h1 className="sf-subtitle">We couldn’t load this page.</h1>
    <p role="alert" className="sf-copy">Please try again. If you were confirming payment, return to checkout to check its status before attempting another payment.</p>
    <div className="flex flex-wrap gap-3 pt-2"><UrbanButton type="button" variant="dark" onClick={reset}>Try again</UrbanButton><UrbanButtonLink href="/checkout" variant="ghost">Check checkout</UrbanButtonLink><UrbanButtonLink href="/support" variant="soft">Get help</UrbanButtonLink></div>
  </div></UrbanContainer></UrbanPageShell>;
}
