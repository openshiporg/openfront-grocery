import { requireSessionStore } from "../lib/storeScope";
import { requireFreshCapability } from '../access';
import { accountEmailProblem, normalizeAccountEmail } from '../../lib/accountContract';
import { verifyCurrentPassword } from '../lib/accountPassword';
import { publicError } from '../lib/publicError';

const CLIENT_ONBOARDING_STATUSES = new Set(['not_started', 'in_progress', 'dismissed']);

/**
 * The only write path for a signed-in account's own profile. Generic User
 * updates cannot change email, password or onboarding status: the sign-in
 * email changes only after the current password is proven, and onboarding
 * transitions require the onboarding capability (completion belongs to
 * runGroceryOnboarding alone).
 */
async function updateActiveUser(
  _root: unknown,
  { data }: { data: { email?: unknown; name?: unknown; onboardingStatus?: unknown; currentPassword?: unknown } },
  context: any
) {
  const session = context.session;
  if (!session?.itemId) throw new Error('Not authenticated');
  await requireSessionStore(context);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Profile data is required');

  const update: Record<string, string> = {};
  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 200) {
      throw publicError('Enter your name (up to 200 characters).');
    }
    update.name = data.name.trim();
  }
  if (data.email !== undefined) {
    const email = normalizeAccountEmail(data.email);
    const problem = accountEmailProblem(email);
    if (problem) throw publicError(problem);
    const current = await context.prisma.user.findUnique({ where: { id: session.itemId }, select: { email: true } });
    if (email !== current?.email) {
      const currentPassword = typeof data.currentPassword === 'string' ? data.currentPassword : '';
      if (!currentPassword || !(await verifyCurrentPassword(context, session.itemId, currentPassword))) {
        throw publicError('Enter your current password to change your sign-in email.');
      }
      const taken = await context.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (taken && taken.id !== session.itemId) throw publicError('That email address is already used by another account.');
      update.email = email;
    }
  }
  if (data.onboardingStatus !== undefined) {
    if (typeof data.onboardingStatus !== 'string' || !CLIENT_ONBOARDING_STATUSES.has(data.onboardingStatus)) {
      throw new Error('Unsupported onboarding status transition');
    }
    await requireFreshCapability(context, 'canManageOnboarding');
    update.onboardingStatus = data.onboardingStatus;
  }
  if (!Object.keys(update).length) {
    if (data.name !== undefined || data.email !== undefined) return context.db.User.findOne({ where: { id: session.itemId } });
    throw new Error('No supported profile changes were provided');
  }

  // Fields above are validated here; the write itself is limited to this account.
  await context.sudo().db.User.updateOne({ where: { id: session.itemId }, data: update });
  return context.db.User.findOne({ where: { id: session.itemId } });
}

export default updateActiveUser;
