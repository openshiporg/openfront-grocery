import { createHmac } from 'node:crypto';
export function signGroceryEvent(body:string,timestamp:string,secret:string) {return createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');}
/** A deployment-owned endpoint, never a shopper/staff supplied URL. */
export async function deliverGroceryIntegrationEvent(event:any) {
  return deliverConfiguredGroceryEvent(event,{destination:process.env.GROCERY_EVENT_WEBHOOK_URL,secret:process.env.GROCERY_EVENT_WEBHOOK_SECRET});
}
export async function deliverConfiguredGroceryEvent(event:any,{destination,secret}:{destination?:string;secret?:string},transport:typeof fetch=fetch,now=Date.now()) {
  if (!destination) return {configured:false};
  const url=new URL(destination);
  if (url.protocol!=='https:' || url.username || url.password) throw new Error('Outbound event endpoint requires HTTPS without URL credentials');
  if (!secret || secret.length<32) throw new Error('Outbound event signing secret must contain at least 32 characters');
  const timestamp=String(Math.floor(now/1000));
  const body=JSON.stringify({id:event.eventId,type:event.eventType,version:event.schemaVersion,occurredAt:event.occurredAt,aggregateType:event.aggregateType,aggregateId:event.aggregateId,payload:event.payload});
  const response=await transport(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json','x-grocery-event-id':event.eventId,'x-grocery-timestamp':timestamp,'x-grocery-signature':signGroceryEvent(body,timestamp,secret)},body});
  if (!response.ok) throw new Error(`Outbound event returned HTTP ${response.status}`);
  return {configured:true,status:response.status};
}
