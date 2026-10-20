import type { ReactNode } from 'react';

export function humanize(value?: string | null) {
  return value ? value.replaceAll('_', ' ') : 'Unknown';
}

type BadgeTone = 'neutral' | 'info' | 'progress' | 'accent' | 'teal' | 'success' | 'warning' | 'danger';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-muted-foreground ring-border',
  info: 'bg-blue-500/10 text-blue-700 ring-blue-600/20 dark:text-blue-300 dark:ring-blue-400/25',
  progress: 'bg-amber-500/10 text-amber-800 ring-amber-600/25 dark:text-amber-300 dark:ring-amber-400/25',
  accent: 'bg-violet-500/10 text-violet-700 ring-violet-600/20 dark:text-violet-300 dark:ring-violet-400/25',
  teal: 'bg-cyan-500/10 text-cyan-800 ring-cyan-600/20 dark:text-cyan-300 dark:ring-cyan-400/25',
  success: 'bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300 dark:ring-emerald-400/25',
  warning: 'bg-orange-500/10 text-orange-800 ring-orange-600/25 dark:text-orange-300 dark:ring-orange-400/25',
  danger: 'bg-red-500/10 text-red-700 ring-red-600/20 dark:text-red-300 dark:ring-red-400/25',
};

const statusTone: Record<string, BadgeTone> = {
  pending: 'info', authorized: 'info', sent: 'info', refunded: 'info', rescheduled: 'info', captured: 'success', awaiting_checkout: 'info', ordered: 'success',
  paused: 'warning', blocked_cart: 'warning', blocked_stock: 'danger', skipped: 'neutral', closed_with_exceptions: 'warning',
  picking: 'progress', processing: 'progress', in_progress: 'progress', receiving: 'progress',
  packed: 'accent', confirmed: 'accent',
  ready_for_pickup: 'teal', out_for_delivery: 'teal',
  delivered: 'success', succeeded: 'success', completed: 'success', active: 'success', received: 'success', approved: 'success', settled: 'success', accepted: 'success', available: 'success', reconciled: 'success', finalized: 'success',
  failed: 'danger', rejected: 'danger', recalled: 'danger', refused: 'danger', dead_letter: 'danger', expired: 'danger',
  partially_refunded: 'warning', held: 'warning', quarantined: 'warning', inspection_pending: 'warning', variance: 'warning', open: 'warning', unknown: 'warning', observed: 'warning', returned: 'warning', requires_customer_authorization: 'warning',
  cancelled: 'neutral', canceled: 'neutral', voided: 'neutral', inactive: 'neutral', closed: 'neutral', draft: 'neutral', planning: 'neutral', planned: 'neutral', archived: 'neutral',
};

export function PlatformStatusBadge({ status, label, tone }: { status?: string | null; label?: ReactNode; tone?: BadgeTone }) {
  const normalized = status || 'unknown';
  const resolved = tone || statusTone[normalized] || 'neutral';
  return (
    <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeTones[resolved]}`}>
      <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
      <span className="first-letter:uppercase">{label || humanize(normalized)}</span>
    </span>
  );
}
