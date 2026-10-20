'use server';
import {keystoneClient} from '@/features/platform/lib/platformClient';
import {revalidatePath} from 'next/cache';
export async function loadWebhookRecovery(page:number){const result=await keystoneClient('query($page:Int){groceryPaymentWebhookRecovery(page:$page)}',{page});if(!result.success)throw new Error(result.error);return result.data.groceryPaymentWebhookRecovery;}
export async function replayWebhookRecovery(eventId:string,reason:string){const result=await keystoneClient('mutation($eventId:ID!,$reason:String!){replayPaymentWebhookEvent(eventId:$eventId,reason:$reason)}',{eventId,reason});if(!result.success)throw new Error(result.error);revalidatePath('/dashboard/platform/payments');return result.data.replayPaymentWebhookEvent;}
