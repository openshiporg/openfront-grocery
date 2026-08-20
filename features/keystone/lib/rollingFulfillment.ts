import type { Context } from '.keystone/types';
import {
  assertValidTimeZone,
  zonedDateKey,
  zonedDateKeyOffset,
  zonedDateTimeForDateKey,
  zonedStartOfDateKey,
} from './storeTime';

const DEFAULT_HORIZON_DAYS = 7;
const MAX_HORIZON_DAYS = 14;
const DEFAULT_CUTOFF_MINUTES = 120;
const MAX_POLICY_SLOTS = 500;
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

type UnknownRecord = Record<string, unknown>;

type DeliveryTemplate = {
  startTime: string;
  endTime: string;
  capacity: number;
  deliveryFee: number;
  isActive: boolean;
};

type PickupTemplate = {
  startTime: string;
  endTime: string;
  maxOrders: number;
  isActive: boolean;
};

type ExistingDeliverySlot = DeliveryTemplate & {
  id: string;
  date: Date | string;
  currentBookings?: number | null;
  updatedAt?: Date | string;
};

type ExistingPickupSlot = PickupTemplate & {
  id: string;
  date: Date | string;
  currentOrders?: number | null;
  isAvailable?: boolean | null;
  updatedAt?: Date | string;
};

export type RollingFulfillmentPolicy = {
  horizonDays: number;
  cutoffMinutes: number;
  blackoutDates: ReadonlySet<string>;
  deliveryTemplates: DeliveryTemplate[];
  pickupTemplates: PickupTemplate[];
};

export type FulfillmentWindowDecision = {
  allowed: boolean;
  reason: 'available' | 'invalid' | 'outside_horizon' | 'blackout' | 'closed' | 'outside_hours' | 'cutoff';
};

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number) {
  const candidate = Number(value);
  return Number.isInteger(candidate) ? Math.min(maximum, Math.max(minimum, candidate)) : fallback;
}

function validDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function timeMinute(value: unknown) {
  if (typeof value !== 'string') return null;
  const twentyFourHour = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (twentyFourHour) {
    const hour = Number(twentyFourHour[1]);
    const minute = Number(twentyFourHour[2]);
    return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
  }
  const twelveHour = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(value.trim());
  if (!twelveHour) return null;
  const hour = Number(twelveHour[1]);
  const minute = Number(twelveHour[2] || 0);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return (hour % 12 + (twelveHour[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + minute;
}

function minuteTime(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function parseRange(value: unknown): { start: number; end: number } | null {
  if (typeof value === 'string') {
    const match = /^(.+?)\s+[\-–]\s+(.+)$/.exec(value.trim());
    if (!match) return null;
    const start = timeMinute(match[1]);
    const end = timeMinute(match[2]);
    return start !== null && end !== null && end > start ? { start, end } : null;
  }
  const source = record(value);
  if (!source) return null;
  const start = timeMinute(source.open ?? source.start);
  const end = timeMinute(source.close ?? source.end);
  return start !== null && end !== null && end > start ? { start, end } : null;
}

function parseDayRanges(value: unknown) {
  if (typeof value === 'string') {
    if (/^closed$/i.test(value.trim())) return [];
    const range = parseRange(value);
    return range ? [range] : [];
  }
  if (Array.isArray(value)) return value.flatMap((candidate) => {
    const range = parseRange(candidate);
    return range ? [range] : [];
  });
  const source = record(value);
  if (!source || source.enabled === false) return [];
  const ranges = Array.isArray(source.ranges) ? source.ranges : [source];
  return ranges.flatMap((candidate) => {
    const range = parseRange(candidate);
    return range ? [range] : [];
  });
}

function operatingRanges(hours: unknown, dateKey: string) {
  const source = record(hours);
  if (!source) return [];
  const policy = record(source.fulfillmentPolicy);
  const specialHours = record(policy?.specialHours);
  const day = DAY_KEYS[new Date(`${dateKey}T12:00:00.000Z`).getUTCDay()];
  return parseDayRanges(specialHours && Object.hasOwn(specialHours, dateKey) ? specialHours[dateKey] : source[day]);
}

function dateKeyFor(value: Date | string, timeZone: string) {
  return validDateKey(value) ? value : zonedDateKey(value, timeZone);
}

function templateKey(template: { startTime: string; endTime: string }) {
  return `${template.startTime}:${template.endTime}`;
}

function validTemplateTimes(startTime: unknown, endTime: unknown) {
  const start = timeMinute(startTime);
  const end = timeMinute(endTime);
  return typeof startTime === 'string' && typeof endTime === 'string'
    && start !== null && end !== null && end > start;
}

function deliveryTemplate(value: unknown): DeliveryTemplate | null {
  const source = record(value);
  const capacity = Number(source?.capacity);
  const deliveryFee = Number(source?.deliveryFee ?? 0);
  if (!source || !validTemplateTimes(source.startTime, source.endTime)
    || !Number.isInteger(capacity) || capacity < 1
    || !Number.isInteger(deliveryFee) || deliveryFee < 0
    || (Object.hasOwn(source, 'isActive') && typeof source.isActive !== 'boolean')) return null;
  return {
    startTime: minuteTime(timeMinute(source.startTime) as number),
    endTime: minuteTime(timeMinute(source.endTime) as number),
    capacity,
    deliveryFee,
    isActive: source.isActive !== false,
  };
}

function pickupTemplate(value: unknown): PickupTemplate | null {
  const source = record(value);
  const maxOrders = Number(source?.maxOrders);
  if (!source || !validTemplateTimes(source.startTime, source.endTime)
    || !Number.isInteger(maxOrders) || maxOrders < 1
    || (Object.hasOwn(source, 'isActive') && typeof source.isActive !== 'boolean')) return null;
  return {
    startTime: minuteTime(timeMinute(source.startTime) as number),
    endTime: minuteTime(timeMinute(source.endTime) as number),
    maxOrders,
    isActive: source.isActive !== false,
  };
}

function latestTemplates<T extends { id: string; date: Date | string; updatedAt?: Date | string; startTime: string; endTime: string }>(
  slots: T[],
  map: (slot: T) => DeliveryTemplate | PickupTemplate | null,
) {
  const sorted = [...slots].sort((left, right) =>
    new Date(right.date).getTime() - new Date(left.date).getTime()
    || new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
    || right.id.localeCompare(left.id)
  );
  const templates = new Map<string, DeliveryTemplate | PickupTemplate>();
  for (const slot of sorted) {
    const candidate = map(slot);
    if (candidate && !templates.has(templateKey(candidate))) templates.set(templateKey(candidate), candidate);
  }
  return Array.from(templates.values());
}

export function assertValidRollingFulfillmentPolicy(hours: unknown) {
  const source = record(hours);
  if (!source) throw new Error('Store hours must be an object');
  if (!Object.hasOwn(source, 'fulfillmentPolicy')) return;
  const configured = record(source.fulfillmentPolicy);
  if (!configured) throw new Error('Store fulfillment policy must be an object');
  for (const [field, minimum, maximum] of [
    ['horizonDays', 1, MAX_HORIZON_DAYS],
    ['cutoffMinutes', 0, 24 * 60],
  ] as const) {
    if (!Object.hasOwn(configured, field)) continue;
    const value = Number(configured[field]);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(`Store fulfillment ${field} must be an integer from ${minimum} to ${maximum}`);
    }
  }
  if (Object.hasOwn(configured, 'blackoutDates')) {
    if (!Array.isArray(configured.blackoutDates) || !configured.blackoutDates.every(validDateKey)) {
      throw new Error('Store fulfillment blackout dates must use real YYYY-MM-DD dates');
    }
  }
  if (Object.hasOwn(configured, 'specialHours')) {
    const specialHours = record(configured.specialHours);
    if (!specialHours || Object.keys(specialHours).some((key) => !validDateKey(key))) {
      throw new Error('Store fulfillment special hours must be keyed by real YYYY-MM-DD dates');
    }
  }
  if (Object.hasOwn(configured, 'deliveryWindows')) {
    if (!Array.isArray(configured.deliveryWindows) || configured.deliveryWindows.some((value) => !deliveryTemplate(value))) {
      throw new Error('Store fulfillment delivery windows require valid time, capacity, fee, and active state');
    }
  }
  if (Object.hasOwn(configured, 'pickupWindows')) {
    if (!Array.isArray(configured.pickupWindows) || configured.pickupWindows.some((value) => !pickupTemplate(value))) {
      throw new Error('Store fulfillment pickup windows require valid time, capacity, and active state');
    }
  }
}

export function resolveRollingFulfillmentPolicy({
  hours,
  deliverySlots,
  pickupSlots,
}: {
  hours: unknown;
  deliverySlots: ExistingDeliverySlot[];
  pickupSlots: ExistingPickupSlot[];
}): RollingFulfillmentPolicy {
  const source = record(hours);
  const configured = record(source?.fulfillmentPolicy);
  const blackoutDates = new Set(
    Array.isArray(configured?.blackoutDates) ? configured.blackoutDates.filter(validDateKey) : [],
  );
  const fallbackDelivery = latestTemplates(deliverySlots, (slot) => deliveryTemplate(slot)) as DeliveryTemplate[];
  const fallbackPickup = latestTemplates(pickupSlots, (slot) => pickupTemplate(slot)) as PickupTemplate[];
  const deliveryTemplates = configured && Object.hasOwn(configured, 'deliveryWindows')
    ? (Array.isArray(configured.deliveryWindows) ? configured.deliveryWindows : []).flatMap((value) => {
        const template = deliveryTemplate(value);
        return template ? [template] : [];
      })
    : fallbackDelivery;
  const pickupTemplates = configured && Object.hasOwn(configured, 'pickupWindows')
    ? (Array.isArray(configured.pickupWindows) ? configured.pickupWindows : []).flatMap((value) => {
        const template = pickupTemplate(value);
        return template ? [template] : [];
      })
    : fallbackPickup;

  return {
    horizonDays: integer(configured?.horizonDays, DEFAULT_HORIZON_DAYS, 1, MAX_HORIZON_DAYS),
    cutoffMinutes: integer(configured?.cutoffMinutes, DEFAULT_CUTOFF_MINUTES, 0, 24 * 60),
    blackoutDates,
    deliveryTemplates,
    pickupTemplates,
  };
}

export function evaluateFulfillmentWindow({
  hours,
  timeZone,
  date,
  startTime,
  endTime,
  now = new Date(),
  applyCutoff = true,
}: {
  hours: unknown;
  timeZone: string;
  date: Date | string;
  startTime: string;
  endTime: string;
  now?: Date;
  applyCutoff?: boolean;
}): FulfillmentWindowDecision {
  try {
    assertValidTimeZone(timeZone);
    assertValidRollingFulfillmentPolicy(hours);
    if (!validTemplateTimes(startTime, endTime)) return { allowed: false, reason: 'invalid' };
    const dateKey = dateKeyFor(date, timeZone);
    const policy = resolveRollingFulfillmentPolicy({ hours, deliverySlots: [], pickupSlots: [] });
    const today = zonedDateKey(now, timeZone);
    const horizonEnd = zonedDateKeyOffset(now, timeZone, policy.horizonDays - 1);
    if (dateKey < today || dateKey > horizonEnd) return { allowed: false, reason: 'outside_horizon' };
    if (policy.blackoutDates.has(dateKey)) return { allowed: false, reason: 'blackout' };
    const ranges = operatingRanges(hours, dateKey);
    if (!ranges.length) return { allowed: false, reason: 'closed' };
    const start = timeMinute(startTime) as number;
    const end = timeMinute(endTime) as number;
    if (!ranges.some((range) => start >= range.start && end <= range.end)) {
      return { allowed: false, reason: 'outside_hours' };
    }
    if (applyCutoff) {
      const startsAt = zonedDateTimeForDateKey(dateKey, minuteTime(start), timeZone);
      if (startsAt.getTime() <= now.getTime() + policy.cutoffMinutes * 60_000) {
        return { allowed: false, reason: 'cutoff' };
      }
    }
    return { allowed: true, reason: 'available' };
  } catch {
    return { allowed: false, reason: 'invalid' };
  }
}

export function planRollingFulfillmentAvailability({
  hours,
  timeZone,
  deliverySlots,
  pickupSlots,
  requestedDays,
  now = new Date(),
}: {
  hours: unknown;
  timeZone: string;
  deliverySlots: ExistingDeliverySlot[];
  pickupSlots: ExistingPickupSlot[];
  requestedDays: number;
  now?: Date;
}) {
  assertValidTimeZone(timeZone);
  assertValidRollingFulfillmentPolicy(hours);
  const policy = resolveRollingFulfillmentPolicy({ hours, deliverySlots, pickupSlots });
  const days = Math.min(policy.horizonDays, integer(requestedDays, DEFAULT_HORIZON_DAYS, 1, MAX_HORIZON_DAYS));
  const existingDelivery = new Set(deliverySlots.map((slot) => `${dateKeyFor(slot.date, timeZone)}:${templateKey(slot)}`));
  const existingPickup = new Set(pickupSlots.map((slot) => `${dateKeyFor(slot.date, timeZone)}:${templateKey(slot)}`));
  const deliveryCreates: Array<DeliveryTemplate & { date: Date; currentBookings: number }> = [];
  const pickupCreates: Array<PickupTemplate & { date: Date; currentOrders: number; isAvailable: boolean }> = [];

  for (let offset = 0; offset < days; offset += 1) {
    const dateKey = zonedDateKeyOffset(now, timeZone, offset);
    const date = zonedStartOfDateKey(dateKey, timeZone);
    for (const template of policy.deliveryTemplates) {
      const key = `${dateKey}:${templateKey(template)}`;
      if (!template.isActive || existingDelivery.has(key)) continue;
      if (!evaluateFulfillmentWindow({ hours, timeZone, date: dateKey, startTime: template.startTime, endTime: template.endTime, now }).allowed) continue;
      deliveryCreates.push({ ...template, date, currentBookings: 0 });
    }
    for (const template of policy.pickupTemplates) {
      const key = `${dateKey}:${templateKey(template)}`;
      if (!template.isActive || existingPickup.has(key)) continue;
      if (!evaluateFulfillmentWindow({ hours, timeZone, date: dateKey, startTime: template.startTime, endTime: template.endTime, now }).allowed) continue;
      pickupCreates.push({ ...template, date, currentOrders: 0, isAvailable: true });
    }
  }

  return { policy, deliveryCreates, pickupCreates };
}

export async function ensureRollingFulfillmentAvailability(
  context: Context,
  store: { id: string; timezone: string },
  requestedDays: number,
  now = new Date(),
) {
  assertValidTimeZone(store.timezone);
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    // Prisma cannot deserialize PostgreSQL's void return type from a bare
    // SELECT pg_advisory_xact_lock(...). Force lock evaluation in a
    // materialized CTE and return a supported boolean column instead.
    await tx.$queryRaw`
      WITH rolling_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtextextended(${`grocery-rolling-fulfillment:${store.id}`}, 0))
      )
      SELECT true AS locked FROM rolling_lock
    `;
    const [settings, deliverySlots, pickupSlots] = await Promise.all([
      tx.storeSettings.findFirst({ where: { storeId: store.id, isActive: true }, select: { hours: true } }),
      tx.deliverySlot.findMany({
        where: { storeId: store.id },
        orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
        take: MAX_POLICY_SLOTS,
        select: { id: true, date: true, startTime: true, endTime: true, capacity: true, currentBookings: true, isActive: true, deliveryFee: true, updatedAt: true },
      }),
      tx.pickupSlot.findMany({
        where: { storeId: store.id },
        orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
        take: MAX_POLICY_SLOTS,
        select: { id: true, date: true, startTime: true, endTime: true, maxOrders: true, currentOrders: true, isActive: true, isAvailable: true, updatedAt: true },
      }),
    ]);
    if (!settings) return { hours: null, createdDelivery: 0, createdPickup: 0 };
    try {
      assertValidRollingFulfillmentPolicy(settings.hours);
    } catch {
      return { hours: null, createdDelivery: 0, createdPickup: 0 };
    }
    const plan = planRollingFulfillmentAvailability({
      hours: settings.hours,
      timeZone: store.timezone,
      deliverySlots: deliverySlots.map((slot) => ({ ...slot, deliveryFee: slot.deliveryFee || 0 })),
      pickupSlots,
      requestedDays,
      now,
    });
    if (plan.deliveryCreates.length) {
      await tx.deliverySlot.createMany({
        data: plan.deliveryCreates.map((slot) => ({ ...slot, storeId: store.id })),
      });
    }
    if (plan.pickupCreates.length) {
      await tx.pickupSlot.createMany({
        data: plan.pickupCreates.map((slot) => ({ ...slot, storeId: store.id })),
      });
    }
    return {
      hours: settings.hours,
      createdDelivery: plan.deliveryCreates.length,
      createdPickup: plan.pickupCreates.length,
    };
  });
}
