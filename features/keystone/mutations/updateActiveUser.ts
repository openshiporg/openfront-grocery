import { requireSessionStore } from "../lib/storeScope";
import { requireFreshCapability } from '../access';

const CLIENT_ONBOARDING_STATUSES = new Set(['not_started', 'in_progress', 'dismissed']);

async function updateActiveUser(
  _root: unknown,
  { data }: { data: { email?: unknown; name?: unknown; onboardingStatus?: unknown } },
  context: any
) {
  const session = context.session;
  if (!session?.itemId) throw new Error('Not authenticated');
  await requireSessionStore(context);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Profile data is required');

  const update: Record<string, string> = {};
  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 200) {
      throw new Error('Name must be between 1 and 200 characters');
    }
    update.name = data.name.trim();
  }
  if (data.email !== undefined) {
    if (typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.email.length > 320) {
      throw new Error('A valid email address is required');
    }
    update.email = data.email.trim().toLowerCase();
  }
  if (data.onboardingStatus !== undefined) {
    if (typeof data.onboardingStatus !== 'string' || !CLIENT_ONBOARDING_STATUSES.has(data.onboardingStatus)) {
      throw new Error('Unsupported onboarding status transition');
    }
    await requireFreshCapability(context, 'canManageOnboarding');
    update.onboardingStatus = data.onboardingStatus;
  }
  if (!Object.keys(update).length) throw new Error('No supported profile changes were provided');

  return context.db.User.updateOne({
    where: { id: session.itemId },
    data: update,
  });
}

export default updateActiveUser;
