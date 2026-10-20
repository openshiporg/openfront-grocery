'use server';
import {keystoneClient} from '@/features/platform/lib/platformClient';
import {revalidatePath} from 'next/cache';
export type CommunicationActionState = { ok: boolean; error: string | null; message: string | null };

/** Retry a failed event, or record/authorize the outcome of an unknown one; errors stay in the form. */
export async function replayCommunication(_previous: CommunicationActionState, form: FormData): Promise<CommunicationActionState> {
  const eventId=String(form.get('eventId'));
  const action=String(form.get('reconcileAction') || '');
  const reason=String(form.get('reason') || '').trim();
  const confirmDuplicateRisk=form.get('confirmDuplicateRisk')==='on';
  const result=action
    ? await keystoneClient<any>('mutation Reconcile($id:ID!,$action:String!,$reason:String!,$confirm:Boolean){reconcileGroceryCustomerDelivery(eventId:$id,action:$action,reason:$reason,confirmDuplicateRisk:$confirm){eventId status}}',{id:eventId,action,reason,confirm:confirmDuplicateRisk},{cache:'no-store'})
    : await keystoneClient<any>('mutation Replay($id:ID!){replayGroceryOutboxEvent(eventId:$id){eventId status}}',{id:eventId},{cache:'no-store'});
  if(!result.success) return {ok:false,error:result.error || 'The event could not be updated.',message:null};
  revalidatePath('/dashboard/platform/communications');
  return {ok:true,error:null,message:action==='acknowledge'?'Outcome recorded. The event will not be sent again.':'Queued for another attempt.'};
}

export async function deliverQueuedMessages() {
  const result=await keystoneClient<{deliverGroceryOutboxNow:{attempted:number;delivered:number;failed:number;unknown:number;suppressed:number}}>('mutation Deliver{deliverGroceryOutboxNow(limit:20)}',{});
  if(!result.success) return {ok:false as const,error:result.error || 'Queued messages could not be processed'};
  revalidatePath('/dashboard/platform/communications');
  return {ok:true as const,data:result.data.deliverGroceryOutboxNow};
}
