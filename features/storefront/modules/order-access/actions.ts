'use server';
import {storefrontGraphQL,throwGraphQLErrors} from '../../lib/data/graphql';
import {rememberGuestOrder} from '../../lib/data/guest-orders';
export async function acceptGuestOrderLink(orderId:string,sessionId:string,token:string) {
  if(orderId.length>200 || sessionId.length>300 || token.length>500) throw new Error('Invalid order link');
  const response=await storefrontGraphQL<{guestGroceryOrder:{id:string}|null}>('query Access($orderId:ID!,$sessionId:String!,$token:String!){guestGroceryOrder(orderId:$orderId,sessionId:$sessionId,token:$token){id}}',{orderId,sessionId,token},{cache:'no-store'});
  throwGraphQLErrors(response.errors);
  if(response.data?.guestGroceryOrder?.id!==orderId) throw new Error('Order link expired; request another below');
  await rememberGuestOrder(orderId,token,sessionId);
  return `/order/${encodeURIComponent(orderId)}`;
}
