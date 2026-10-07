import {groceryOutboxPayloadHash} from './groceryOutbox';
import {reconcileOrderLoyalty,restoreLoyaltyRedemptionForOrder} from './loyaltyAccounting';
import {isOrderFullyRefunded,releaseOrderCoupon} from './couponRedemptions';
export function refundedGoodsForLoyalty(sale:any,refunds:any[]) {
 const goods=Number(sale.subtotalCents)-Number(sale.discountCents),total=Number(sale.totalCents);
 if(!Number.isSafeInteger(goods)||goods<0||!Number.isSafeInteger(total)||total<0)throw new Error('Invalid final goods basis for rewards');
 const relevant=refunds.filter(r=>r.status==='succeeded'&&new Date(r.processedAt).getTime()>=new Date(sale.finalizedAt).getTime());
 let knownGoods=0,unallocatedCash=0,cash=0;
 for(const refund of relevant){cash+=Number(refund.amountCents);const commercial=refund.providerData?.commercialAdjustments;
  if(commercial?.kind==='final_sale_line_refund'&&commercial.settlementId===sale.settlementId)knownGoods+=Number(commercial.netGoodsCents);
  else unallocatedCash+=Number(refund.amountCents);
 }
 const estimatedGoods=total?Number((BigInt(goods)*BigInt(unallocatedCash)+BigInt(Math.floor(total/2)))/BigInt(total)):0;
 return {netGoodsCents:Math.max(0,goods-knownGoods-estimatedGoods),fullyRefunded:total>0&&cash>=total,sourceId:'refund-ledger:'+groceryOutboxPayloadHash({refunds:relevant.map(r=>({id:r.id,amountCents:r.amountCents,commercial:r.providerData?.commercialAdjustments || null})).sort((a,b)=>a.id.localeCompare(b.id))}),policy:unallocatedCash?'Line evidence plus proportional allocation of amount-only goodwill to rewards; no inferred tax reversal.':'Final line commercial evidence',unallocatedCashCents:unallocatedCash};
}
/** Separate outbox step maintains Order -> Payment -> loyalty-account lock ordering. */
export async function applyRefundLoyalty(context:any,storeId:string,orderId:string) {
 return context.transaction(async(tc:any)=>{
  const tx=tc.prisma;await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id"=$1 FOR UPDATE',orderId);
  const order=await tx.order.findUnique({where:{id:orderId}});if(!order||order.storeId!==storeId)throw new Error('Reward order is outside the active Store');
  const payments=await tx.payment.findMany({where:{orderId,storeId},select:{id:true,status:true,amountCents:true},orderBy:{id:'asc'}});
  for(const payment of payments)await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id"=$1 FOR UPDATE',payment.id);
  const lockedPayments=await tx.payment.findMany({where:{orderId,storeId},select:{id:true,status:true,amountCents:true},orderBy:{id:'asc'}});
  const refunds=await tx.paymentRefund.findMany({where:{paymentId:{in:payments.map((p:any)=>p.id)},status:'succeeded'}});
  const fullyRefunded=isOrderFullyRefunded(lockedPayments,refunds);
  const couponRelease=fullyRefunded?await releaseOrderCoupon(tx,{storeId,orderId,sourceId:'full-refund:'+groceryOutboxPayloadHash(refunds.map((refund:any)=>refund.id).sort()),reason:'Captured order payments fully refunded'}):null;
  const metadata=couponRelease?.metadata||order.metadata;
  if(fullyRefunded&&order.userId)await restoreLoyaltyRedemptionForOrder(tx,{storeId,orderId,sourceId:'full-refund:'+groceryOutboxPayloadHash(refunds.map((refund:any)=>refund.id).sort()),reason:'Captured order payments fully refunded'});
  if(order.metadata?.finalSale?.status!=='finalized'||!order.userId)return;
  const allocation=refundedGoodsForLoyalty(order.metadata.finalSale,refunds);
  await reconcileOrderLoyalty(tx,{storeId,orderId,sourceId:allocation.sourceId,reason:allocation.policy,netGoodsCents:allocation.netGoodsCents,settled:true,actorId:context.session?.itemId});
  await tx.order.update({where:{id:orderId},data:{metadata:{...metadata,loyaltyRefundAllocation:allocation}}});
 });
}
