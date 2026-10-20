import { UrbanContainer, UrbanPageShell } from '@/features/storefront/modules/urban/UrbanPrimitives';
export default function Loading() {
  return <UrbanPageShell><UrbanContainer className="space-y-6 py-8 sm:py-10">
    <p role="status" className="sr-only">Loading your shop…</p>
    <div aria-hidden="true" className="space-y-3"><div className="sf-skeleton h-4 w-40" /><div className="sf-skeleton h-11 w-2/3 max-w-lg" /></div>
    <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-5">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="space-y-3"><div className="sf-skeleton aspect-square rounded-[var(--sf-radius-lg)]" /><div className="sf-skeleton h-4 w-3/4" /><div className="sf-skeleton h-6 w-1/3" /></div>)}</div>
  </UrbanContainer></UrbanPageShell>;
}
