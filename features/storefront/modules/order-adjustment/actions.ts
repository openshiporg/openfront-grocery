'use server';
import {cookies} from 'next/headers';
import {storefrontGraphQL,throwGraphQLErrors} from '../../lib/data/graphql';
export async function requestAdjustmentAuthorization(orderId:string) {
  const jar=await cookies();
  const result=await storefrontGraphQL<{authorizeOrderAdjustment:{clientSecret:string;paymentIntentId:string;totalCents:number}}>('mutation Adjust($orderId:ID!,$sessionId:String,$token:String){authorizeOrderAdjustment(orderId:$orderId,sessionId:$sessionId,token:$token)}',{
    orderId,sessionId:jar.get(`grocery_order_session_${orderId}`)?.value || jar.get('grocery_cart_session')?.value,token:jar.get(`grocery_order_${orderId}`)?.value});
  throwGraphQLErrors(result.errors);
  if(!result.data?.authorizeOrderAdjustment) throw new Error('Revised authorization is unavailable');
  return result.data.authorizeOrderAdjustment;
}
