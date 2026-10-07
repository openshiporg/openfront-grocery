import submitGroceryOrder from './submitGroceryOrder';
/** Recover from the immutable server attempt, never from redirect amount/address fields. */
export async function resumeGroceryCheckout(_root: unknown, {paymentSessionId,sessionId}: {paymentSessionId:string;sessionId?:string}, context:any) {
  const attempt=await context.prisma.checkoutAttempt.findUnique({where:{idempotencyKey:`checkout:${paymentSessionId}`}});
  const request=attempt?.requestData;
  const userId=context.session?.itemId;
  if (!attempt || !request || (userId ? request.checkoutOwnerId!==userId : !sessionId?.trim() || request.checkoutOwnerId || request.sessionId!==sessionId.trim())) throw new Error('Checkout attempt not found');
  return submitGroceryOrder(null,{data:{...request,sessionId:userId?undefined:sessionId}},context);
}
