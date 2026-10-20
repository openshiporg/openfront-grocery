import { assertObjectType } from 'graphql';
import type { Context } from '.keystone/types';

type SecretFieldImpl = { compare(secret: string, hash: string): Promise<boolean>; generateHash(secret: string): Promise<string> };

function isSecretFieldImpl(value: unknown): value is SecretFieldImpl {
  return Boolean(value && typeof (value as SecretFieldImpl).compare === 'function' && typeof (value as SecretFieldImpl).generateHash === 'function');
}

/**
 * Verify the signed-in account's current password with the same secret-field
 * implementation Keystone's own authenticateUserWithPassword uses (the
 * password field's `keystoneSecretField` extension). Unknown accounts still
 * spend a hash so timing does not reveal them.
 */
export async function verifyCurrentPassword(context: Context, userId: string, secret: string) {
  const field = assertObjectType(context.graphql.schema.getType('User')).getFields().password;
  const impl = field?.extensions?.keystoneSecretField;
  if (!isSecretFieldImpl(impl)) throw new Error('Password verification is unavailable');
  const user = await context.prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!user?.password) {
    await impl.generateHash('simulated-password-to-counter-timing-attack');
    return false;
  }
  return impl.compare(secret, user.password);
}
