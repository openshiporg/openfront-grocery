/** Caller locks Order first; refund operations lock these same Payment rows. */
export async function assertOrderHandoffPayment(tx: any, order: any) {
  await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "order" = $1 ORDER BY "id" FOR UPDATE',order.id);
  const payments = await tx.payment.findMany({where:{orderId:order.id},include:{refunds:true}});
  if (order.metadata?.finalSale?.status !== 'finalized') throw new Error('Finalize actual goods and payment before handoff');
  const desired = Number(order.metadata.finalSale.totalCents);
  if (!Number.isSafeInteger(desired) || desired<0) throw new Error('Invalid final goods amount');
  const noCharge=order.metadata.finalSale.noChargeAuthorized;
  if(desired===0 && !(noCharge?.actorId && noCharge?.reason && order.metadata.finalSale.actuals?.some((line:any)=>line.quantityMilli>0))) throw new Error('An empty or fully reversed order must be canceled, not handed over');
  let net=0;
  for (const payment of payments) {
    if (payment.refunds.some((r:any)=>r.status==='processing')) throw new Error('Refund reconciliation is pending');
    if (!['succeeded','partially_refunded'].includes(payment.status)) continue;
    net+=Number(payment.amountCents)-payment.refunds.filter((r:any)=>r.status==='succeeded').reduce((n:number,r:any)=>n+Number(r.amountCents),0);
  }
  if (net!==desired) throw new Error('Current net payment does not match the final goods; resolve refunds before handoff');
}
