'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function TaskButton({
  label,
  pendingLabel = 'Working…',
  successLabel = 'Saved',
  onRun,
  variant = 'secondary',
}: {
  label: string;
  pendingLabel?: string;
  successLabel?: string;
  onRun: () => Promise<unknown>;
  variant?: 'primary' | 'secondary' | 'destructive';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const styles = variant === 'primary'
    ? 'border-foreground bg-foreground text-background hover:opacity-90'
    : variant === 'destructive'
      ? 'border-destructive/40 text-destructive hover:bg-destructive/5'
      : 'hover:bg-muted';

  return (
    <span className="inline-flex min-w-0 flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={() => startTransition(async () => {
          setMessage(null);
          setFailed(false);
          try {
            await onRun();
            setMessage(successLabel);
            router.refresh();
          } catch (error) {
            setFailed(true);
            setMessage(error instanceof Error ? error.message : 'Task failed');
          }
        })}
        className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50 ${styles}`}
      >
        {pending ? pendingLabel : label}
      </button>
      {message ? <span role={failed ? 'alert' : 'status'} className={`max-w-64 text-left text-[11px] ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>{message}</span> : null}
    </span>
  );
}
