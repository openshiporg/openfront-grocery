'use server';
import {cookies} from 'next/headers';
import {storefrontGraphQL} from '../../lib/data/graphql';

/** Customer self-cancel, with the same owner proof as substitution answers (signed-in owner or guest order link). */
export async function cancelMyOrder(orderId:string) {
  const jar=await cookies();
  const result=await storefrontGraphQL<{cancelMyGroceryOrder:{status:string}}>('mutation CancelMine($orderId:ID!,$sessionId:String,$token:String){cancelMyGroceryOrder(orderId:$orderId,sessionId:$sessionId,token:$token){status}}',{
    orderId,sessionId:jar.get(`grocery_order_session_${orderId}`)?.value || jar.get('grocery_cart_session')?.value,token:jar.get(`grocery_order_${orderId}`)?.value},{cache:'no-store'});
  if(result.errors?.length) return {ok:false as const,error:result.errors.map(error=>error.message || 'The order could not be cancelled').join('\n')};
  if(result.data?.cancelMyGroceryOrder?.status!=='cancelled') return {ok:false as const,error:'The order could not be cancelled. Refresh and try again.'};
  return {ok:true as const};
}
