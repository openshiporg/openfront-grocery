/** The store's calendar date (YYYY-MM-DD) in its own timezone, or null when the zone is unusable. */
export function storeToday(timezone?: string) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch { return null; }
}
