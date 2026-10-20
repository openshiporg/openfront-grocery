/** Display formatters for platform screens. Amounts are integer minor units unless the name says otherwise. */
import { formatSlotRange, timezoneLabel } from '@/features/storefront/lib/marketFormatting';

export function formatMoney(cents?: number | null, currencyCode = 'USD') {
  const value = Number.isFinite(cents) ? Number(cents) : 0;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode || 'USD' }).format(value / 100);
  } catch {
    return `${(value / 100).toFixed(2)} ${currencyCode}`;
  }
}

function toDate(value?: string | number | Date | null) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value?: string | number | Date | null, fallback = '—') {
  const date = toDate(value);
  return date ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date) : fallback;
}

export function formatDateTime(value?: string | number | Date | null, fallback = '—') {
  const date = toDate(value);
  return date ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : fallback;
}

/** Calendar dates stored at midnight UTC (slots, delivery days) must not shift with the viewer's timezone. */
export function formatCalendarDate(value?: string | null, fallback = '—') {
  const date = toDate(value);
  return date ? new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date) : fallback;
}

/**
 * Formats an instant in an explicit IANA zone (a schedule's or the Store's), so the text is the
 * same for every viewer and identical between server render and client hydration.
 */
export function formatInTimeZone(
  value: string | number | Date | null | undefined,
  timeZone?: string | null,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
  fallback = '—',
) {
  const date = toDate(value);
  if (!date) return fallback;
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: timeZone || 'UTC' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(date);
  }
}

const LEGACY_WINDOWS: Record<string, [string, string]> = {
  time_8_10: ['08:00', '10:00'], time_10_12: ['10:00', '12:00'], time_12_14: ['12:00', '14:00'],
  time_14_16: ['14:00', '16:00'], time_16_18: ['16:00', '18:00'], time_18_20: ['18:00', '20:00'],
};

/**
 * The customer's booked promise. Orders snapshot the exact slot (Store-local date and wall-clock
 * times) in metadata; the legacy two-hour enum is only a fallback for orders without that snapshot.
 * Uses the same range wording as the storefront receipt so both sides read identically.
 */
export function formatFulfillmentPromise(
  order: { deliveryDate?: string | null; deliveryTimeWindow?: string | null; metadata?: Record<string, any> | null },
  timeZone?: string | null,
  fallback = 'Window not recorded',
) {
  const slot = order.metadata?.selectedFulfillmentSlot;
  const [start, end] = slot?.startTime && slot?.endTime ? [String(slot.startTime), String(slot.endTime)] : LEGACY_WINDOWS[order.deliveryTimeWindow || ''] || [];
  // Slot dates are the Store-local midnight instant, so read them in the Store's timezone.
  const dateValue = slot?.date || order.deliveryDate;
  const day = timeZone ? formatInTimeZone(dateValue, timeZone, { weekday: 'short', month: 'short', day: 'numeric' }, '') : formatCalendarDate(dateValue, '');
  if (!start || !end) return day || fallback;
  return `${day ? `${day} · ` : ''}${formatSlotRange(start, end)} ${timezoneLabel(timeZone)}`;
}

export function formatRelative(value?: string | number | Date | null, now = Date.now()) {
  const date = toDate(value);
  if (!date) return '—';
  const seconds = Math.round((date.getTime() - now) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [['day', 86400], ['hour', 3600], ['minute', 60]];
  const formatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(seconds, 'second');
}

export function formatCount(value?: number | null) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${formatCount(count)} ${count === 1 ? singular : pluralForm}`;
}

export function shortId(id?: string | null, length = 6) {
  return id ? `…${id.slice(-length)}` : '—';
}
