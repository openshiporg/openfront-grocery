'use client';
import { formatRelative } from '@/features/platform/lib/format';
import { useFormattedTime } from '@/features/dashboard/lib/useViewerTime';

/**
 * Viewer-local timestamp for client workflows. The server renders in its own timezone and the browser
 * re-renders in the viewer's, so only this element's text and title are allowed to settle on hydration.
 * Use `formatInTimeZone` instead when a Store or schedule timezone is known.
 */
export function PlatformTime({ value, relative = false, now, prefix, className }: { value?: string | number | Date | null; relative?: boolean; now?: number; prefix?: string; className?: string }) {
  const date = value === null || value === undefined || value === '' ? null : new Date(value);
  const absolute = useFormattedTime(date && !Number.isNaN(date.getTime()) ? date : null, 'datetime');
  if (!date || Number.isNaN(date.getTime())) return <span className={className}>—</span>;
  return (
    <time dateTime={date.toISOString()} title={relative ? absolute : undefined} className={className} suppressHydrationWarning>
      {prefix ? `${prefix} ` : ''}{relative ? formatRelative(date, now) : absolute}
    </time>
  );
}
