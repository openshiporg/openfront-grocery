import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { publicError } from '../lib/publicError';
import { requireSessionStore } from '../lib/storeScope';
import { assertValidTimeZone } from '../lib/storeTime';
import { assertValidRollingFulfillmentPolicy, openingHoursEntryProblem } from '../lib/rollingFulfillment';
import { accountEmailProblem } from '../../lib/accountContract';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

type ProfileInput = {
  name?: string; tagline?: string; homepageTitle?: string; homepageDescription?: string;
  contactEmail?: string; contactPhone?: string; address?: string; countryCode?: string;
  locale?: string; timezone?: string; taxRateBps?: number; policyNotes?: string;
  hours?: Partial<Record<(typeof DAYS)[number], string>> | null;
};

function text(value: unknown, label: string, max: number, required = false) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (required && !result) throw publicError(`${label} is required.`);
  if (result.length > max) throw publicError(`${label} must be ${max} characters or fewer.`);
  return result;
}

/**
 * The Store details editor: validates every field, then writes StoreSettings and
 * its Store mirror (name, timezone) together in one transaction under the Store
 * and settings row locks, so the two never disagree about the store's name or
 * local day. Currency stays fixed and lifecycle fields are not editable here.
 */
export async function updateGroceryStoreProfile(_root: unknown, { input }: { input: ProfileInput }, context: Context) {
  await requireFreshCapability(context, 'canManageOnboarding');
  const store = await requireSessionStore(context);
  if (!input || typeof input !== 'object') throw publicError('Store details are required.');
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = text(input.name, 'Store name', 120, true);
  if (input.tagline !== undefined) data.tagline = text(input.tagline, 'Tagline', 200);
  if (input.homepageTitle !== undefined) data.homepageTitle = text(input.homepageTitle, 'Homepage title', 200);
  if (input.homepageDescription !== undefined) data.homepageDescription = text(input.homepageDescription, 'Homepage description', 1000);
  if (input.contactEmail !== undefined) {
    const email = text(input.contactEmail, 'Contact email', 254).toLowerCase();
    if (email && accountEmailProblem(email)) throw publicError('Enter a valid contact email.');
    data.contactEmail = email;
  }
  if (input.contactPhone !== undefined) data.contactPhone = text(input.contactPhone, 'Contact phone', 40);
  if (input.address !== undefined) data.address = text(input.address, 'Address', 500);
  if (input.policyNotes !== undefined) data.policyNotes = text(input.policyNotes, 'Policy notes', 5000);
  if (input.countryCode !== undefined) {
    const country = text(input.countryCode, 'Country', 2, true).toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw publicError('Use a two-letter country code, like US.');
    data.countryCode = country;
  }
  if (input.locale !== undefined) {
    const locale = text(input.locale, 'Locale', 35, true);
    try { Intl.getCanonicalLocales(locale); } catch { throw publicError('Use a locale like en-US.'); }
    data.locale = locale;
  }
  if (input.timezone !== undefined) {
    const timezone = text(input.timezone, 'Timezone', 64, true);
    try { assertValidTimeZone(timezone); } catch { throw publicError('Choose a valid timezone, like America/Los_Angeles.'); }
    data.timezone = timezone;
  }
  if (input.taxRateBps !== undefined) {
    if (!Number.isInteger(input.taxRateBps) || input.taxRateBps < 0 || input.taxRateBps > 10_000) throw publicError('Tax rate must be between 0% and 100% with at most two decimals.');
    data.taxRateBps = input.taxRateBps;
  }

  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Store" WHERE "id" = $1 FOR UPDATE', store.id);
    await tx.$queryRawUnsafe('SELECT "id" FROM "StoreSettings" WHERE "store" = $1 FOR UPDATE', store.id);
    const settings = await tx.storeSettings.findUnique({ where: { storeId: store.id }, select: { id: true, hours: true } });
    if (!settings) throw publicError('Finish store setup before editing details.');
    if (input.hours) {
      const hours = { ...((settings.hours as Record<string, unknown> | null) || {}) };
      for (const day of DAYS) {
        const value = input.hours[day];
        if (value === undefined) continue;
        const entry = String(value).trim();
        const problem = openingHoursEntryProblem(entry);
        if (problem) throw publicError(`${day[0].toUpperCase()}${day.slice(1)}: ${problem}`);
        hours[day] = entry;
      }
      assertValidRollingFulfillmentPolicy(hours);
      data.hours = hours;
    }
    if (!Object.keys(data).length) throw publicError('There were no changes to save.');
    await tx.storeSettings.update({ where: { id: settings.id }, data });
    const mirror = Object.fromEntries(Object.entries({ name: data.name, timezone: data.timezone }).filter(([, value]) => value !== undefined));
    if (Object.keys(mirror).length) await tx.store.update({ where: { id: store.id }, data: mirror });
    return { success: true };
  });
}
