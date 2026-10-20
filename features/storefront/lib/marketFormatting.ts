// The storefront's own currency and locale, from Store settings (set once per
// render by the storefront layout). Grocery stores price in two-decimal
// currencies only; receipts pass their order's checkout-time currency instead.
let storefrontCurrency = 'USD';
let storefrontLocale = 'en-US';

export function configureStorefrontMoney(currency?: string | null, locale?: string | null) {
  if (currency && /^[A-Z]{3}$/.test(currency)) storefrontCurrency = currency;
  if (locale) {
    try { storefrontLocale = Intl.getCanonicalLocales(locale)[0] || storefrontLocale; } catch { /* keep the previous locale */ }
  }
}

function formatAmount(amount: number, currency?: string | null) {
  const code = currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : storefrontCurrency;
  try {
    return new Intl.NumberFormat(storefrontLocale, { style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

/** Catalog/cart amounts are major units; order amounts use the explicit cents formatter. */
export function formatMoney(value?: number | null, currency?: string | null) {
  return typeof value === 'number' && Number.isFinite(value) ? formatAmount(value, currency) : '—';
}
export function formatCents(value?: number | null, currency?: string | null) {
  return typeof value === 'number' && Number.isFinite(value) ? formatAmount(value / 100, currency) : '—';
}

/**
 * Display-only formatting for store-local fulfillment windows. The server owns
 * the slot's date, times and timezone; these helpers only change how the same
 * wall-clock strings read ("14:00" → "2pm"). Unknown shapes are returned as-is.
 */
function clockParts(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hour: hours % 12 || 12, minutes, meridiem: hours < 12 ? 'am' : 'pm' };
}

export function formatSlotRange(startTime: string, endTime: string) {
  const start = clockParts(startTime);
  const end = clockParts(endTime);
  if (!start || !end) return `${startTime}–${endTime}`;
  const label = (part: NonNullable<typeof start>) => `${part.hour}${part.minutes ? `:${String(part.minutes).padStart(2, '0')}` : ''}`;
  return start.meridiem === end.meridiem
    ? `${label(start)}–${label(end)}${end.meridiem}`
    : `${label(start)}${start.meridiem}–${label(end)}${end.meridiem}`;
}

/** Slot dates are store-local calendar dates (YYYY-MM-DD); noon avoids DST edges. */
export function slotDate(date: string) {
  return new Date(`${date}T12:00:00`);
}

export function formatSlotDay(date: string, style: 'short' | 'long' = 'short') {
  const value = slotDate(date);
  if (Number.isNaN(value.getTime())) return date;
  return value.toLocaleDateString('en-US', style === 'long'
    ? { weekday: 'long', month: 'long', day: 'numeric' }
    : { weekday: 'short', month: 'short', day: 'numeric' });
}

/** A short, human label for an IANA timezone ("PT"), falling back to the identifier. */
export function timezoneLabel(timezone?: string | null) {
  if (!timezone) return 'store local time';
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'shortGeneric' })
      .formatToParts(new Date())
      .find((entry) => entry.type === 'timeZoneName');
    return part?.value || timezone;
  } catch {
    return timezone;
  }
}

/**
 * A fulfillment promise as recorded on an order. `date` is the store-local
 * calendar day (YYYY-MM-DD), never an instant; times stay unknown when nothing
 * was recorded instead of being guessed.
 */
export type RecordedFulfillmentWindow = { date: string; startTime: string | null; endTime: string | null };

/** The calendar key of a stored date-only promise (a UTC-midnight DateTime or a YYYY-MM-DD string). */
export function calendarKey(value: string | Date | null | undefined) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Legacy window codes such as `time_8_10` name their hours; anything else is unknown. */
export function legacyWindowTimes(code: string | null | undefined) {
  const match = /^time_(\d{1,2})_(\d{1,2})$/.exec(String(code || ''));
  if (!match) return { startTime: null, endTime: null };
  const start = Number(match[1]), end = Number(match[2]);
  if (start > 23 || end > 24 || end <= start) return { startTime: null, endTime: null };
  const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
  return { startTime: clock(start), endTime: clock(end) };
}
