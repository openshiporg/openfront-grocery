import { Skeleton } from '@/components/ui/skeleton';
import { PageContainer } from '@/features/dashboard/components/PageContainer';

/** Mirrors the PlatformPage frame so route transitions keep header, metrics and the primary queue in place. */
export function PlatformPageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <PageContainer
      title="Loading"
      breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Platform' }]}
      header={
        <div aria-hidden="true" className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
      }
    >
      <div role="status" aria-live="polite" className="space-y-5 px-4 pb-12 md:px-6">
        <span className="sr-only">Loading platform workspace…</span>
        <div aria-hidden="true" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-2.5 bg-card px-4 py-3.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
        <Skeleton aria-hidden="true" className="h-10 w-full rounded-lg" />
        <div aria-hidden="true" className="overflow-hidden rounded-xl border bg-card">
          <div className="space-y-2 border-b px-5 py-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-72" />
          </div>
          <div className="flex gap-4 border-b px-5 py-3">
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-4 w-16" />)}
          </div>
          <div className="divide-y">
            {Array.from({ length: rows }, (_, index) => (
              <div key={index} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="hidden h-5 w-20 sm:block" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
