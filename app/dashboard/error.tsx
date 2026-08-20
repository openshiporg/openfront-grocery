'use client';

import { useEffect } from 'react';

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">The operator view could not load</h1>
      <p className="text-sm text-muted-foreground">The request failed safely. Retry without losing your store session.</p>
      <button type="button" onClick={() => reset()} className="rounded-md border px-4 py-2 text-sm font-medium">Retry</button>
    </main>
  );
}
