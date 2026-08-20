import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';

export async function provisionGroceryCustomer(
  _root: unknown,
  { name, email, temporaryPassword }: { name: string; email: string; temporaryPassword: string },
  context: Context,
) {
  const { storeId } = await requireFreshCapability(context, 'canManageUsers');
  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedName.length < 2 || normalizedName.length > 120) throw new Error('Customer name must be between 2 and 120 characters');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('A valid customer email is required');
  if (temporaryPassword.length < 12 || temporaryPassword.length > 200) throw new Error('Temporary password must be between 12 and 200 characters');

  const existing = await context.prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
  if (existing) throw new Error('A customer with this email already exists');

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
