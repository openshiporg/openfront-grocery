import {createHash} from 'node:crypto';
import {publicStore} from '../lib/storeScope';
import {enqueueGroceryOutboxEvent} from '../lib/groceryOutbox';
export async function requestGuestOrderAccess(_root:unknown,{orderId,email}:{orderId:string;email:string},context:any) {
  if(orderId.length>200 || email.length>320 || !/^\S+@\S+\.\S+$/.test(email)) return true;
  const store=await publicStore(context);
  const order=await context.prisma.order.findFirst({where:{id:orderId,storeId:store.id,email:{equals:email.trim(),mode:'insensitive'},userId:null},select:{id:true}});
  if(order) await context.transaction(async(tc:any)=> {
    const bucket=Math.floor(Date.now()/300000);
    const key=createHash('sha256').update(`${order.id}:${bucket}`).digest('hex');
    await enqueueGroceryOutboxEvent(tc.prisma,{storeId:store.id,eventKey:`order.access:${key}`,eventType:'order.access.requested',aggregateType:'Order',aggregateId:order.id,occurredAt:new Date().toISOString(),payload:{orderId:order.id}});
  });
  return true;
}
