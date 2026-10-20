import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { accountEmailProblem, normalizeAccountEmail, shopperPasswordProblem } from '../../lib/accountContract';
import { publicError } from '../lib/publicError';

export async function provisionGroceryCustomer(
  _root: unknown,
  { name, email, temporaryPassword }: { name: string; email: string; temporaryPassword: string },
  context: Context,
) {
  const { storeId } = await requireFreshCapability(context, 'canManageUsers');
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const normalizedEmail = normalizeAccountEmail(email);
  if (normalizedName.length < 1 || normalizedName.length > 120 || /[\r\n]/.test(normalizedName)) throw publicError('Enter the customer’s name (up to 120 characters).');
  const emailProblem = accountEmailProblem(normalizedEmail);
  if (emailProblem) throw publicError(emailProblem);
  const passwordProblem = shopperPasswordProblem(typeof temporaryPassword === 'string' ? temporaryPassword : '');
  if (passwordProblem) throw publicError(passwordProblem.replace('Choose a password', 'Choose a temporary password'));

  const existing = await context.prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
  if (existing) throw publicError('A customer with this email already exists.');

  const customer = await context.sudo().db.User.createOne({
    data: {
      name: normalizedName,
      email: normalizedEmail,
      password: temporaryPassword,
      store: { connect: { id: storeId } },
      onboardingStatus: 'not_started',
    },
  });
  return { success: true, customerId: customer.id, name: normalizedName, email: normalizedEmail };
}
