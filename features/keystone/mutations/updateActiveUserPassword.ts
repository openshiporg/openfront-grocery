import type { Context } from '.keystone/types';

import { shopperPasswordProblem } from '../../lib/accountContract';
import { verifyCurrentPassword } from '../lib/accountPassword';
import { publicError } from '../lib/publicError';
import { requireSessionStore } from '../lib/storeScope';

/**
 * Change the signed-in account's password (E-commerce updateActiveUserPassword
 * pattern). The current password must be proven; only the caller's own
 * password changes, and no other account field can be written here.
 */
export default async function updateActiveUserPassword(
  _root: unknown,
  args: { currentPassword: string; newPassword: string },
  context: Context,
) {
  const userId = context.session?.itemId;
  if (!userId) throw publicError('Sign in to change your password.', 'UNAUTHENTICATED');
  await requireSessionStore(context);
  const currentPassword = typeof args.currentPassword === 'string' ? args.currentPassword : '';
  const newPassword = typeof args.newPassword === 'string' ? args.newPassword : '';
  const problem = shopperPasswordProblem(newPassword);
  if (problem) throw publicError(problem);
  if (newPassword === currentPassword) throw publicError('Choose a new password that is different from your current one.');
  if (!currentPassword || !(await verifyCurrentPassword(context, userId, currentPassword))) {
    throw publicError('Your current password is not correct.');
  }
  await context.sudo().db.User.updateOne({ where: { id: userId }, data: { password: newPassword } });
  return true;
}
