'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Check, LoaderCircle } from 'lucide-react';
import { platformButton, type PlatformButtonSize } from './platformStyles';

export function TaskButton({
  label,
  pendingLabel = 'Working…',
  successLabel = 'Saved',
  onRun,
  variant = 'secondary',
  size = 'sm',
  icon,
  confirmPrompt,
  confirmLabel = 'Confirm',
}: {
  label: string;
  pendingLabel?: string;
  successLabel?: string;
  onRun: () => Promise<unknown>;
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  size?: PlatformButtonSize;
  icon?: ReactNode;
  /** When set, the first press asks for confirmation before the task runs. */
  confirmPrompt?: string;
  confirmLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [armed, setArmed] = useState(false);

  const run = () => startTransition(async () => {
    setMessage(null);
    setFailed(false);
    try {
      const result = await onRun();
      // Server actions return business errors as { ok: false, error } rather than throwing.
      if (result && typeof result === 'object' && (result as { ok?: unknown }).ok === false) throw new Error(String((result as { error?: unknown }).error || 'Task failed'));
      setMessage(successLabel);
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : 'Task failed');
    } finally {
      setArmed(false);
    }
  });

  return (
    <span className="inline-flex min-w-0 flex-col items-start gap-1">
      {armed && !pending ? (
        <span role="group" aria-label={label} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-foreground">{confirmPrompt}</span>
          <button type="button" onClick={run} className={platformButton(variant, size)}>{confirmLabel}</button>
          <button type="button" onClick={() => setArmed(false)} className={platformButton('ghost', size)}>Keep</button>
        </span>
      ) : (
        <button
          type="button"
          disabled={pending}
          aria-busy={pending}
          onClick={() => { setMessage(null); if (confirmPrompt) setArmed(true); else run(); }}
          className={platformButton(variant, size)}
        >
          {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : icon}
          {pending ? pendingLabel : label}
        </button>
      )}
      {message ? (
        <span role={failed ? 'alert' : 'status'} className={`flex max-w-72 items-start gap-1 text-left text-xs leading-snug ${failed ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`}>
          {failed ? null : <Check className="mt-px size-3.5 shrink-0" aria-hidden="true" />}
          {message}
        </span>
      ) : null}
    </span>
  );
}
