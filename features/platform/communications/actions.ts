'use server';
import {keystoneClient} from '@/features/dashboard/lib/keystoneClient';
import {revalidatePath} from 'next/cache';
export async function replayCommunication(form:FormData) {
  const eventId=String(form.get('eventId'));
  const action=String(form.get('reconcileAction') || '');
  const reason=String(form.get('reason') || '').trim();
  const confirmDuplicateRisk=form.get('confirmDuplicateRisk')==='on';
  const result=action
    ? await keystoneClient('mutation Reconcile($id:ID!,$action:String!,$reason:String!,$confirm:Boolean){reconcileGroceryCustomerDelivery(eventId:$id,action:$action,reason:$reason,confirmDuplicateRisk:$confirm){eventId status}}',{id:eventId,action,reason,confirm:confirmDuplicateRisk})
    : await keystoneClient('mutation Replay($id:ID!){replayGroceryOutboxEvent(eventId:$id){eventId status}}',{id:eventId});
  if(!result.success) throw new Error(result.error);revalidatePath('/dashboard/platform/communications');
}
