'use server';
import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/platform/lib/platformClient';
export async function staffOperation(operation: 'invite' | 'access' | 'revoke' | 'privacy', input: Record<string, unknown>) {
  const documents = {
    invite: `mutation Invite($name:String!,$email:String!,$capabilities:JSON!,$delivery:String){inviteGroceryStaff(name:$name,email:$email,capabilities:$capabilities,delivery:$delivery)}`,
    access: `mutation Access($userId:ID!,$capabilities:JSON!,$reason:String!){updateGroceryStaffAccess(userId:$userId,capabilities:$capabilities,reason:$reason)}`,
    revoke: `mutation Revoke($invitationId:ID!,$reason:String!){revokeGroceryStaffInvitation(invitationId:$invitationId,reason:$reason)}`,
    privacy: `mutation Review($requestId:ID!,$approve:Boolean!,$reason:String!){reviewGroceryCustomerErasure(requestId:$requestId,approve:$approve,reason:$reason)}`,
  };
  if (!Object.hasOwn(documents, operation)) return { ok: false as const, error: 'Unknown staff operation' };
  const result = await keystoneClient(documents[operation], input);
  // Returned, not thrown: production Next.js hides messages thrown from server actions.
  if (!result.success) return { ok: false as const, error: result.error || 'Unable to save' };
  revalidatePath('/dashboard/platform/staff');
  return { ok: true as const, data: Object.values(result.data || {})[0] as any };
}
