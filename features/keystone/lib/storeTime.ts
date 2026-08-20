export function zonedDateKey(value: Date | string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function zonedStartOfDateKey(key: string, timeZone: string) {
  assertValidTimeZone(timeZone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error('Store date key must use YYYY-MM-DD');
  const [year, month, day] = key.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(candidate));
    const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value || 0);
    const represented = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
    candidate -= represented - target;
  }
  return new Date(candidate);
}

export function zonedStartOfDay(value: Date, timeZone: string) {
  return zonedStartOfDateKey(zonedDateKey(value, timeZone), timeZone);
}

export function zonedDateTimeForDateKey(key: string, time: string, timeZone: string) {
  assertValidTimeZone(timeZone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error('Store date key must use YYYY-MM-DD');
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!timeMatch || Number(timeMatch[1]) > 23 || Number(timeMatch[2]) > 59) {
    throw new Error('Store time must use valid HH:mm');
  }
  const [year, month, day] = key.split('-').map(Number);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(candidate));
    const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value || 0);
    const represented = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
    candidate -= represented - target;
  }
  const result = new Date(candidate);
  if (zonedDateKey(result, timeZone) !== key || zonedMinuteOfDay(result, timeZone) !== hour * 60 + minute) {
    throw new Error('Store-local time does not exist in the configured timezone');
  }
  return result;
}

export function zonedDateKeyOffset(value: Date, timeZone: string, days: number) {
  assertValidTimeZone(timeZone);
  const [year, month, day] = zonedDateKey(value, timeZone).split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1, day + Math.trunc(days)));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(target.getUTCDate()).padStart(2, '0')}`;
}

export function zonedMinuteOfDay(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value || 0);
  return part('hour') * 60 + part('minute');
}

function slotMinute(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Fulfillment slot time must use HH:mm');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error('Fulfillment slot time is invalid');
  return hour * 60 + minute;
}

export function assertValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    throw new Error('Store timezone must be a valid IANA timezone');
  }
}

export function isLiveFulfillmentSlot(
  slot: { date: Date | string; endTime: string },
  timeZone: string,
  now = new Date(),
) {
  assertValidTimeZone(timeZone);
  const slotDate = zonedDateKey(slot.date, timeZone);
  const today = zonedDateKey(now, timeZone);
  if (slotDate < today) return false;
  return slotDate !== today || slotMinute(slot.endTime) > zonedMinuteOfDay(now, timeZone);
}

export function isSlotWithinDays(
  slot: { date: Date | string; endTime: string },
  timeZone: string,
  days: number,
  now = new Date(),
) {
  if (!isLiveFulfillmentSlot(slot, timeZone, now)) return false;
  const slotDate = zonedDateKey(slot.date, timeZone);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + days);
  return slotDate <= zonedDateKey(end, timeZone);
}
