import {createGuestOrderToken} from '../utils/guestOrderToken';
export function refundReceiptSnapshot(refund:any,order:any) {
  if(!refund || refund.status!=='succeeded' || refund.payment?.orderId!==order.id || refund.payment?.storeId!==order.storeId) throw new Error('Refund receipt does not belong to the customer order');
  const cents=(value:any)=>{if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid refund receipt amount');return value;};
  const amountCents=cents(refund.amountCents),commercial=refund.providerData?.commercialAdjustments;
  if(commercial?.kind!=='final_sale_line_refund')return {amountCents,kind:'amount_only'};
  if(commercial.orderId!==order.id || String(commercial.currencyCode).toUpperCase()!==String(order.currencyCode).toUpperCase() || cents(commercial.totalCents)!==amountCents)throw new Error('Refund commercial receipt differs from its payment');
  const lines=(commercial.lines||[]).map((line:any)=>({productTitle:String(line.productTitle||'Refunded item'),unitOfMeasure:String(line.unitOfMeasure||'each'),quantityMilli:cents(line.quantityMilli),netGoodsCents:cents(line.netGoodsCents),taxCents:cents(line.taxCents),discountCents:cents(line.discountCents),totalCents:cents(line.totalCents)}));
  if(!lines.length || lines.some((line:any)=>line.quantityMilli<1||line.netGoodsCents+line.taxCents!==line.totalCents) || lines.reduce((sum:number,line:any)=>sum+line.totalCents,0)!==amountCents)throw new Error('Refund line receipt amounts do not reconcile');
  return {kind:'line_refund',amountCents,lines};
}
export function communicationAllowed(type:string,preference:any) {
  // Requested access links and material transaction receipts are required service messages.
  if (['order.rescheduled','order.adjustment.requested','order.confirmed','order.access.requested','order.finalized','payment.refunded','inventory.recall.notice'].includes(type)) return true;
  if (preference && Array.isArray(preference.channels) && !preference.channels.includes('email')) return false;
  if(type==='product.back_in_stock') return preference?.backInStock!==false;
  if(type==='order.dispatched') return preference?.deliveryAlerts!==false;
  return preference?.orderUpdates!==false;
}
export function orderMessage(type:string,order:any,origin:string,event:any={}) {
  const url=new URL(origin);
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid public message origin');
  let path=`/order/${encodeURIComponent(order.id)}`;
  if (!order.userId && order.metadata?.guestSessionId) {
    const sessionId=String(order.metadata.guestSessionId);
    const token=createGuestOrderToken(order.id,sessionId);
    path='/order-access#'+new URLSearchParams({orderId:order.id,sessionId,token}).toString();
  }
  if(type==='payment.refunded') {
    const refund=event.refundReceipt;
    if(!refund || refund.amountCents!==event.amountCents)throw new Error('Verified refund receipt evidence is required');
    const items=refund.kind==='line_refund' ? 'Refunded items:\n'+refund.lines.map((line:any)=>`${line.productTitle}: ${line.quantityMilli/1000} ${line.unitOfMeasure}\nGoods refunded: ${(line.netGoodsCents/100).toFixed(2)}; tax refunded: ${(line.taxCents/100).toFixed(2)}; discount reversed: ${(line.discountCents/100).toFixed(2)}; line refund: ${(line.totalCents/100).toFixed(2)}`).join('\n') : 'Amount-only refund. No item or tax reversal is recorded.';
    return {subject:`Refund recorded #${order.displayId}`,text:`Refund recorded #${order.displayId}\nRefund amount: ${(refund.amountCents/100).toFixed(2)} ${order.currencyCode}\n${items}\n${new URL(path,url).toString()}`};
  }
  const sale=order.metadata?.finalSale?.status==='finalized'?order.metadata.finalSale:null;
  const lines=sale?.actuals || order.lineItems || [];
  const items=lines.map((l:any)=>`${l.productTitle || l.title}: ${l.quantityMilli!==undefined?l.quantityMilli/1000:l.quantity} ${l.unitOfMeasure || ''} — ${((l.subtotalCents ?? Number(l.unitPriceCents)*Number(l.quantity))/100).toFixed(2)}`).join('\n');
  const names:Record<string,string>={'order.rescheduled':'Delivery rescheduled','order.cancelled':'Order cancelled','inventory.recall.notice':'Safety recall notice','order.adjustment.requested':'Approval needed for picked amount','order.confirmed':'Order authorized','order.ready':'Ready for pickup','order.dispatched':'Out for delivery','order.finalized':'Final receipt','payment.refunded':'Refund recorded','order.access.requested':'Your order access'};
  const window = (promise:any) => { const slot=promise?.selectedFulfillmentSlot; return slot ? `${String(slot.date || '').slice(0,10)} ${String(slot.startTime || '')}–${String(slot.endTime || '')}` : 'See your order for the original window'; };
  const reschedule = type==='order.rescheduled' ? `Previous delivery window: ${window(event.before)}\nNew delivery window: ${window(event.after)}\n` : '';
  return {subject:`${names[type] || 'Order update'} #${order.displayId}`,text:`${names[type] || 'Order update'} #${order.displayId}\n${reschedule}${type==='inventory.recall.notice' ? 'Do not consume affected goods. Contact the store. '+String(event.reason || '')+'\n' : ''}${type==='payment.refunded' ? 'Refund amount: '+(Number(event.amountCents || 0)/100).toFixed(2)+' '+order.currencyCode+'\n' : ''}${items}\nSubtotal: ${((sale?.subtotalCents ?? order.subtotalCents)/100).toFixed(2)}\nDiscount: ${((sale?.discountCents ?? order.discountCents)/100).toFixed(2)}\nTax: ${((sale?.taxCents ?? order.taxCents)/100).toFixed(2)}\nFees: ${((sale?.feeCents ?? order.deliveryFeeCents)/100).toFixed(2)}\nTotal (${order.currencyCode}): ${((sale?.totalCents ?? order.totalCents)/100).toFixed(2)}\n${new URL(path,url).toString()}`};
}
