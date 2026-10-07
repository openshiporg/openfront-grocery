import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
export async function groceryPaymentWebhookRecovery(_root:unknown,{page=1}:{page?:number},context:any){
 await requireFreshCapability(context,'canManagePayments');const store=await requireSessionStore(context);
 if(!Number.isSafeInteger(page)||page<1||page>1000000)throw new Error('Invalid recovery page');
 const where={storeId:store.id,status:{in:['unmatched','processing']}};
 const [total,events]=await Promise.all([context.prisma.paymentWebhookEvent.count({where}),context.prisma.paymentWebhookEvent.findMany({where,orderBy:[{createdAt:'asc'},{id:'asc'}],skip:(page-1)*25,take:25,select:{id:true,providerCode:true,providerEventId:true,eventType:true,status:true,processingAttempts:true,nextAttemptAt:true,deadLetterAt:true,lastProcessingError:true}})]);
 const safeEvents=events.map((event:any)=>({...event,lastProcessingError:event.lastProcessingError?'Reconciliation details are withheld; review payment/refund evidence before replay.':''}));
 return {page,total,totalPages:Math.max(1,Math.ceil(total/25)),events:safeEvents};
}
