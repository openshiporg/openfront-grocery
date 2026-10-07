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
export async function requestOrderAccess(form:FormData) {
  const orderId=String(form.get('orderId') || '').trim();
  const email=String(form.get('email') || '').trim();
  if(!orderId || orderId.length>200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>320) throw new Error('Enter a valid order ID and checkout email.');
  const result=await storefrontGraphQL('mutation Access($orderId:ID!,$email:String!){requestGuestOrderAccess(orderId:$orderId,email:$email)}',{orderId,email});
  throwGraphQLErrors(result.errors);
  if(result.data?.requestGuestOrderAccess !== true) throw new Error('The access link could not be requested. Please try again.');
  return 'If those details match a guest order, an access link will be emailed.';
}
