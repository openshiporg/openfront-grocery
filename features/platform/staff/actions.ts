'use server';
import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
export async function staffOperation(operation: 'invite' | 'access' | 'revoke' | 'privacy', input: Record<string, unknown>) {
  const documents = {
    invite: `mutation Invite($name:String!,$email:String!,$capabilities:JSON!){inviteGroceryStaff(name:$name,email:$email,capabilities:$capabilities)}`,
    access: `mutation Access($userId:ID!,$capabilities:JSON!,$reason:String!){updateGroceryStaffAccess(userId:$userId,capabilities:$capabilities,reason:$reason)}`,
    revoke: `mutation Revoke($invitationId:ID!,$reason:String!){revokeGroceryStaffInvitation(invitationId:$invitationId,reason:$reason)}`,
    privacy: `mutation Review($requestId:ID!,$approve:Boolean!,$reason:String!){reviewGroceryCustomerErasure(requestId:$requestId,approve:$approve,reason:$reason)}`,
  };
  if (!Object.hasOwn(documents, operation)) throw new Error('Unknown staff operation');
  const result = await keystoneClient(documents[operation], input);
  if (!result.success) throw new Error(result.error);
  revalidatePath('/dashboard/platform/staff');
  return Object.values(result.data || {})[0] as any;
}
