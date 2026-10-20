import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { enqueueGroceryOutboxEvent } from '../lib/groceryOutbox';
import { STAFF_CAPABILITIES, assertCapabilitiesRecoverable, assertLastManagerSafe, createStaffInvitationToken, encryptStaffInvitationToken, normalizeStaffCapabilities, staffInvitationHash, verifyStaffInvitationToken } from '../lib/staffInvitations';

async function lockedStaffActor(tx: any, actorId: string, storeId: string) {
  await tx.$queryRawUnsafe('SELECT "id" FROM "Store" WHERE "id" = $1 FOR UPDATE', storeId);
  await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', actorId);
  const actor = await tx.user.findUnique({ where: { id: actorId }, include: { role: true, store: true } });
  if (actor?.storeId !== storeId || !actor.store?.isActive || !actor.role?.canManageUsers) throw new Error('Current staff-administration capability required');
  return actor;
}
export async function groceryStaffDirectory(_root: unknown, args: { page?: number; pageSize?: number; search?: string | null; access?: string | null }, context: Context) {
  await requireFreshCapability(context, 'canManageUsers'); const store = await requireSessionStore(context); const tx = context.prisma as any;
  const page = Math.max(1, Math.trunc(Number(args?.page) || 1)); const pageSize = Math.max(1, Math.min(100, Math.trunc(Number(args?.pageSize) || 25)));
  const skip = (page - 1) * pageSize;
  // Staff search and access filter apply to the whole directory before paging.
  const search = String(args?.search || '').trim().slice(0, 100);
  const staffBase = { storeId: store.id, OR: [{ roleId: { not: null } }, { staffAccessEvents: { some: { storeId: store.id } } }] };
  const staffSearch = search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } : {};
  const accessViews: Record<string, any> = { active: { roleId: { not: null } }, revoked: { roleId: null } };
  const access = accessViews[args?.access || ''] ? args!.access! : 'all';
  const staffScope = (view: string) => ({ ...staffBase, AND: [staffSearch, accessViews[view] || {}] });
  const staffWhere = staffScope(access);
  const [staff, invitations, events, privacyRequests, staffCount, invitationCount, eventCount, privacyCount, accessCounts] = await Promise.all([
    tx.user.findMany({ where: staffWhere, select: { id: true, name: true, email: true, role: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: pageSize, skip }),
    tx.staffInvitation.findMany({ where: { storeId: store.id, status: 'pending' }, select: { id: true, email: true, name: true, status: true, capabilities: true, expiresAt: true }, orderBy: { createdAt: 'desc' }, take: pageSize, skip }),
    tx.staffAccessEvent.findMany({ where: { storeId: store.id }, select: { id: true, action: true, reason: true, createdAt: true, subject: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: pageSize, skip }),
    tx.customerPrivacyRequest.findMany({ where: { storeId: store.id, status: { in: ['requested', 'deferred'] } }, select: { id: true, kind: true, status: true, eligibleAt: true, createdAt: true, user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'asc' }, take: pageSize, skip }),
    tx.user.count({ where: staffWhere }), tx.staffInvitation.count({ where: { storeId: store.id, status: 'pending' } }), tx.staffAccessEvent.count({ where: { storeId: store.id } }), tx.customerPrivacyRequest.count({ where: { storeId: store.id, status: { in: ['requested', 'deferred'] } } }),
    Promise.all(['all', 'active', 'revoked'].map(async (view) => [view, await tx.user.count({ where: staffScope(view) })] as const)),
  ]);
  return { staff, invitations, events, privacyRequests, search, access, accessCounts: Object.fromEntries(accessCounts), pagination: { page, pageSize, totalPages: Math.max(1, Math.ceil(Math.max(staffCount, invitationCount, eventCount, privacyCount) / pageSize)), counts: { staffCount, invitationCount, eventCount, privacyCount } } };
}
export async function inviteGroceryStaff(_root: unknown, args: { name: string; email: string; capabilities: unknown; delivery?: string | null }, context: Context) {
  await requireFreshCapability(context, 'canManageUsers'); const store = await requireSessionStore(context);
  const email = args.email.trim().toLowerCase(), name = args.name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 2 || name.length > 120) throw new Error('A valid name and email are required');
  // The inviting manager chooses how the single-use link travels: the store's email service, or
  // handed over in person. Either way only the token hash is stored, the link expires in 48 hours,
  // can be revoked, and acceptance re-checks the inviter's current authority.
  if (args.delivery != null && !['email', 'manual'].includes(args.delivery)) throw new Error('Choose email or manual invitation delivery');
  const delivery = args.delivery === 'manual' ? 'manual' : 'email';
  const token = createStaffInvitationToken(); const encryptedToken = encryptStaffInvitationToken(token);
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma as any; const actor = await lockedStaffActor(tx, context.session!.itemId, store.id);
    const capabilities = normalizeStaffCapabilities(args.capabilities, actor.role);
    if (await tx.user.findUnique({ where: { email } })) throw new Error('An account already uses this email; invite a separate staff identity');
    const pending = await tx.staffInvitation.findFirst({ where: { email, storeId: store.id, status: 'pending', expiresAt: { gt: new Date() } } });
    if (pending) throw new Error('A pending invitation already exists; revoke it before replacing it');
    const invitation = await tx.staffInvitation.create({ data: { storeId: store.id, name, email, tokenHash: staffInvitationHash(token), capabilities, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), invitedById: actor.id, status: 'pending' } });
    await tx.staffAccessEvent.create({ data: { storeId: store.id, actorId: actor.id, invitationId: invitation.id, action: 'invited', reason: delivery === 'manual' ? 'Staff invitation · link handed over by inviter' : 'Staff invitation · sent by email', after: capabilities } });
    if (delivery === 'email') {
      await enqueueGroceryOutboxEvent(tx, { storeId: store.id, eventKey: `staff-invitation:${invitation.id}`, eventType: 'staff.invited', aggregateType: 'StaffInvitation', aggregateId: invitation.id, occurredAt: new Date().toISOString(), payload: { invitationId: invitation.id, encryptedToken } });
      return { success: true, invitationId: invitation.id, expiresAt: invitation.expiresAt, delivery };
    }
    // Manual handover: the link goes back once, in this response only, to the inviter; it is
    // never stored, queued or logged. The invitee still sets their own password to accept.
    return { success: true, invitationId: invitation.id, expiresAt: invitation.expiresAt, delivery, acceptPath: `/staff/accept#${new URLSearchParams({ token })}` };
  });
}
export async function acceptGroceryStaffInvitation(_root: unknown, args: { token: string; password: string }, context: Context) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(args.token) || args.password.length < 12 || args.password.length > 128) throw new Error('Valid invitation and a password of 12–128 characters are required');
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma as any;
    const found = await tx.staffInvitation.findUnique({ where: { tokenHash: staffInvitationHash(args.token) } });
    if (!found) throw new Error('Invitation is invalid or expired');
    await tx.$queryRawUnsafe('SELECT "id" FROM "Store" WHERE "id" = $1 FOR UPDATE', found.storeId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "StaffInvitation" WHERE "id" = $1 FOR UPDATE', found.id);
    const invitation = await tx.staffInvitation.findUnique({ where: { id: found.id }, include: { store: true } });
    if (!invitation || invitation.status !== 'pending' || !invitation.store?.isActive || new Date(invitation.expiresAt).getTime() <= Date.now() || !verifyStaffInvitationToken(args.token, invitation.tokenHash)) throw new Error('Invitation is invalid or expired');
    const actor = await tx.user.findUnique({ where: { id: invitation.invitedById }, include: { role: true } });
    if (actor?.storeId !== invitation.storeId || !actor.role?.canManageUsers) throw new Error('Inviter no longer has staff-administration authority');
    const capabilities = normalizeStaffCapabilities(invitation.capabilities, actor.role);
    if (await tx.user.findUnique({ where: { email: invitation.email } })) throw new Error('An account already uses this invitation email');
    const role = await tx.role.create({ data: { name: `${invitation.name} staff`, storeId: invitation.storeId, ...capabilities } });
    // The Keystone password field hashes the plaintext inside its field hook.
    // Prisma must never receive or persist a plaintext password.
    const user = await transactionContext.sudo().db.User.createOne({ data: { name: invitation.name, email: invitation.email, password: args.password, store: { connect: { id: invitation.storeId } }, role: { connect: { id: role.id } }, onboardingStatus: 'completed' } });
    await tx.staffInvitation.update({ where: { id: invitation.id }, data: { status: 'accepted', acceptedAt: new Date(), acceptedUserId: user.id } });
    await tx.staffAccessEvent.create({ data: { storeId: invitation.storeId, actorId: invitation.invitedById, subjectId: user.id, invitationId: invitation.id, action: 'accepted', reason: 'Invitation accepted by token holder', after: capabilities } });
    return { success: true, message: 'Staff account created. Sign in with your email and password.' };
  });
}
export async function updateGroceryStaffAccess(_root: unknown, args: { userId: string; capabilities: unknown; reason: string }, context: Context) {
  await requireFreshCapability(context, 'canManageUsers'); const store = await requireSessionStore(context);
  const reason = args.reason.trim(); if (reason.length < 3 || reason.length > 500) throw new Error('A reason of 3–500 characters is required');
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma as any; const actor = await lockedStaffActor(tx, context.session!.itemId, store.id);
    const next = normalizeStaffCapabilities(args.capabilities, actor.role);
    const target = await tx.user.findUnique({ where: { id: args.userId }, include: { role: true } });
    if (!target || target.storeId !== store.id || target.privacyErasedAt || (!target.role && !(await tx.staffAccessEvent.count({ where: { storeId: store.id, subjectId: target.id } })))) throw new Error('Staff identity not found in active Store');
    const managers = await tx.user.count({ where: { storeId: store.id, privacyErasedAt: null, role: { canManageUsers: true, canAccessDashboard: true } } });
    assertLastManagerSafe(target, next, managers);
    const activeStaff = await tx.user.findMany({ where: { storeId: store.id, privacyErasedAt: null, roleId: { not: null } }, select: { id: true, role: true }, take: 1000 });
    assertCapabilitiesRecoverable(activeStaff, target.id, next);
    const role = Object.values(next).some(Boolean) ? await tx.role.create({ data: { name: `${target.name} staff`, storeId: store.id, ...next } }) : null;
    await tx.user.update({ where: { id: target.id }, data: { roleId: role?.id || null } });
    await tx.staffAccessEvent.create({ data: { storeId: store.id, actorId: actor.id, subjectId: target.id, action: role ? 'access_changed' : 'access_revoked', reason, before: Object.fromEntries(STAFF_CAPABILITIES.map((key) => [key, Boolean(target.role?.[key])])), after: next } });
    return { success: true, userId: target.id, revoked: !role };
  });
}
export async function revokeGroceryStaffInvitation(_root: unknown, args: { invitationId: string; reason: string }, context: Context) {
  await requireFreshCapability(context, 'canManageUsers'); const store = await requireSessionStore(context);
  if (args.reason.trim().length < 3 || args.reason.length > 500) throw new Error('A reason is required');
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma as any; const actor = await lockedStaffActor(tx, context.session!.itemId, store.id);
    const invitation = await tx.staffInvitation.findUnique({ where: { id: args.invitationId } });
    if (!invitation || invitation.storeId !== store.id || invitation.status !== 'pending') throw new Error('Pending invitation not found');
    await tx.staffInvitation.update({ where: { id: invitation.id }, data: { status: 'revoked' } });
    await tx.staffAccessEvent.create({ data: { storeId: store.id, actorId: actor.id, invitationId: invitation.id, action: 'invitation_revoked', reason: args.reason.trim() } });
    return { success: true };
  });
}
