'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCw, TriangleAlert } from 'lucide-react';
import { platformButton } from './platformStyles';

/** Route error boundary for platform screens. The dashboard shell and sidebar stay mounted. */
export function PlatformRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="px-4 py-10 md:px-6">
      <div role="alert" className="mx-auto max-w-lg rounded-xl border bg-card p-6 text-center shadow-xs">
        <span className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
          <TriangleAlert className="size-5" aria-hidden="true" />
        </span>
        <h1 className="text-base font-semibold">This page couldn’t load</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Retry to load the latest records. If you had just saved a change, check the record before submitting it again.
        </p>
        {error.digest ? <p className="mt-3 font-mono text-xs text-muted-foreground">Reference {error.digest}</p> : null}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={reset} className={platformButton('primary', 'md')}><RotateCw aria-hidden="true" />Try again</button>
          <Link href="/dashboard" className={platformButton('secondary', 'md')}>Back to dashboard</Link>
        </div>
      </div>
    </div>
  );
}
