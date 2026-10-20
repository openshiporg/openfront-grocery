import {createHash} from 'node:crypto';
import {publicStore} from '../lib/storeScope';
import {enqueueGroceryOutboxEvent} from '../lib/groceryOutbox';
/**
 * Email a guest a fresh access link. The shopper may give the order number shown
 * on their confirmation and emails (e.g. 1024 or #1024) or the order's internal
 * ID; with the checkout email it must match a guest order of this Store. The
 * response is the same whether or not anything matched, so it reveals nothing.
 */
export async function requestGuestOrderAccess(_root:unknown,{orderId,email}:{orderId:string;email:string},context:any) {
  const reference=String(orderId||'').trim();
  const address=String(email||'').trim();
  if(!reference || reference.length>200 || address.length>320 || !/^\S+@\S+\.\S+$/.test(address)) return true;
  const store=await publicStore(context);
  const number=/^#?(\d{1,9})$/.exec(reference);
  const order=await context.prisma.order.findFirst({where:{...(number?{displayId:Number(number[1])}:{id:reference}),storeId:store.id,email:{equals:address,mode:'insensitive'},userId:null},select:{id:true}});
  if(order) await context.transaction(async(tc:any)=> {
    const bucket=Math.floor(Date.now()/300000);
    const key=createHash('sha256').update(`${order.id}:${bucket}`).digest('hex');
    await enqueueGroceryOutboxEvent(tc.prisma,{storeId:store.id,eventKey:`order.access:${key}`,eventType:'order.access.requested',aggregateType:'Order',aggregateId:order.id,occurredAt:new Date().toISOString(),payload:{orderId:order.id}});
  });
  return true;
}
