'use server';
import {cookies} from 'next/headers';
import {storefrontGraphQL} from '../../lib/data/graphql';

/** Records the customer's answer with the same owner proof as revised-payment approval. */
export async function answerSubstitution(input:{orderId:string;lineItemId:string;proposalId:string;decision:'approve'|'reject'}) {
  const jar=await cookies();
  const result=await storefrontGraphQL<{respondToOrderLineSubstitution:{status:string}}>('mutation Answer($orderId:ID!,$lineItemId:ID!,$proposalId:String!,$decision:String!,$sessionId:String,$token:String){respondToOrderLineSubstitution(orderId:$orderId,lineItemId:$lineItemId,proposalId:$proposalId,decision:$decision,sessionId:$sessionId,token:$token)}',{
    ...input,sessionId:jar.get(`grocery_order_session_${input.orderId}`)?.value || jar.get('grocery_cart_session')?.value,token:jar.get(`grocery_order_${input.orderId}`)?.value},{cache:'no-store'});
  if(result.errors?.length) return {ok:false as const,error:result.errors.map(error=>error.message || 'Your answer could not be saved').join('\n')};
  if(!result.data?.respondToOrderLineSubstitution) return {ok:false as const,error:'Your answer could not be saved. Refresh your order and try again.'};
  return {ok:true as const,status:result.data.respondToOrderLineSubstitution.status};
}
