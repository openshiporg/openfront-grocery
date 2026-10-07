import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getSessionSecret } from './runtimeConfig';
export const STAFF_CAPABILITIES = ['canManageProducts', 'canManageOrders', 'canManageInventory', 'canManageSuppliers', 'canManageDelivery', 'canManageUsers', 'canManagePayments', 'canManageOnboarding', 'canAccessDashboard'] as const;
export type StaffCapabilities = Record<typeof STAFF_CAPABILITIES[number], boolean>;
export function normalizeStaffCapabilities(input: unknown, actor: Record<string, unknown>): StaffCapabilities {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('An explicit capability map is required');
  if (Object.keys(input).some((key) => !STAFF_CAPABILITIES.includes(key as any))) throw new Error('Unknown staff capability');
  const result = {} as StaffCapabilities;
  for (const key of STAFF_CAPABILITIES) {
    const value = (input as any)[key] ?? false;
    if (typeof value !== 'boolean') throw new Error('Capabilities must be boolean');
    if (value && actor[key] !== true) throw new Error(`Cannot grant capability not currently held: ${key}`);
    result[key] = value;
  }
  if (Object.values(result).some(Boolean) && !result.canAccessDashboard) throw new Error('Staff capabilities require dashboard access');
  return result;
}
export function staffInvitationHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
export function verifyStaffInvitationToken(token: string, hash: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[a-f0-9]{64}$/.test(hash)) return false;
  return timingSafeEqual(Buffer.from(staffInvitationHash(token), 'hex'), Buffer.from(hash, 'hex'));
}
function encryptionKey(secret: string) { return createHash('sha256').update(`grocery-staff-invitation:v1:${secret}`).digest(); }
export function encryptStaffInvitationToken(token: string, secret = getSessionSecret()) {
  const nonce = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), nonce);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function decryptStaffInvitationToken(sealed: string, secret = getSessionSecret()) {
  const bytes = Buffer.from(sealed, 'base64url');
  if (bytes.length < 29) throw new Error('Invalid encrypted invitation');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}
export function createStaffInvitationToken() { return randomBytes(32).toString('base64url'); }
export function assertLastManagerSafe(target: any, next: StaffCapabilities, managerCount: number) {
  if (target?.role?.canManageUsers && target.role.canAccessDashboard && !(next.canManageUsers && next.canAccessDashboard) && managerCount <= 1) throw new Error('The last staff administrator cannot be revoked or downgraded');
}
