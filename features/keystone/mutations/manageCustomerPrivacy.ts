import { randomBytes } from 'node:crypto';
import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { groceryOutboxPayloadHash } from '../lib/groceryOutbox';
import { requireSessionStore } from '../lib/storeScope';
import { CUSTOMER_PRIVACY_POLICY, customerExportIdentity, privacyErasureEligibility, scrubOrderContactMetadata } from '../lib/privacyPolicy';

async function privacyCustomer(context: Context) {
  if (!context.session?.itemId) throw new Error('Sign in to manage your privacy requests');
  const user = await (context.prisma as any).user.findUnique({ where: { id: context.session.itemId }, include: { store: true } });
  if (!user || !user.store?.isActive || user.roleId || user.privacyErasedAt) throw new Error('An active customer account is required');
  return user;
}
export async function groceryCustomerPrivacy(_root: unknown, args: { page?: number; pageSize?: number }, context: Context) {
  const user = await privacyCustomer(context);
  const page = Math.max(1, Math.trunc(Number(args?.page) || 1));
  const pageSize = Math.max(1, Math.min(100, Math.trunc(Number(args?.pageSize) || 25)));
  const requestCount = await (context.prisma as any).customerPrivacyRequest.count({ where: { userId: user.id, storeId: user.storeId } });
  const requests = await (context.prisma as any).customerPrivacyRequest.findMany({ where: { userId: user.id, storeId: user.storeId }, select: { id: true, kind: true, status: true, createdAt: true, completedAt: true, eligibleAt: true, reviewReason: true, policyVersion: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: pageSize, skip: (page - 1) * pageSize });
  return { policy: CUSTOMER_PRIVACY_POLICY, requests, pagination: { page, pageSize, totalPages: Math.max(1, Math.ceil(requestCount / pageSize)), requestCount } };
}
export async function requestGroceryCustomerPrivacy(_root: unknown, { kind }: { kind: string }, context: Context) {
  const user = await privacyCustomer(context);
  if (!['export', 'erasure'].includes(kind)) throw new Error('Choose export or erasure');
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma as any;
    await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', user.id);
    const existing = await tx.customerPrivacyRequest.findFirst({ where: { userId: user.id, kind, status: { in: ['requested', 'deferred'] } } });
    if (existing) return { success: true, requestId: existing.id, status: existing.status, reused: true };
    const request = await tx.customerPrivacyRequest.create({ data: { userId: user.id, storeId: user.storeId, kind, status: 'requested', policyVersion: CUSTOMER_PRIVACY_POLICY.version } });
    return { success: true, requestId: request.id, status: request.status, reused: false };
  });
}
const EXPORT_COLLECTIONS = ['orders', 'orderLines', 'actuals', 'substitutions', 'settlements', 'payments', 'refunds', 'lineRefunds', 'addresses', 'notificationPreferences', 'substitutionPreferences', 'shoppingLists', 'shoppingListItems', 'favorites', 'priceAlerts', 'stockAlerts', 'coupons', 'loyalty', 'redemptions', 'subscriptions', 'subscriptionRuns', 'messages', 'carts', 'cartItems', 'privacyRequests'] as const;
const pick = (value:any, keys:string[]) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key,value[key]]));
const publicEvents = (value:any) => (Array.isArray(value)?value:[]).map(event=>pick(event,['action','at','nextDeliveryDate','timezone','status','reason']));
export async function exportGroceryCustomerData(_root: unknown, args: { requestId: string; afterOrderId?: string; collection?: string; afterId?: string }, context: Context) {
  const user = await privacyCustomer(context); const tx = context.prisma as any;
  const request = await tx.customerPrivacyRequest.findUnique({ where: { id: args.requestId } });
  if (!request || request.userId !== user.id || request.storeId !== user.storeId || request.kind !== 'export' || request.status === 'rejected') throw new Error('Owned export request not found');
  const collection = args.collection || 'orders';
  if (!(EXPORT_COLLECTIONS as readonly string[]).includes(collection)) throw new Error('Unsupported export collection');
  const own = { userId: user.id, storeId: user.storeId }, owner = { userId: user.id }, orderOwner = { order: own }, lineOwner = { lineItem: { order: own } };
  const configuration: Record<string, { model:string; where:any; fields:string[]; map?:(row:any)=>any }> = {
    orders:{model:'order',where:own,fields:['id','displayId','status','createdAt','totalCents','subtotalCents','discountCents','taxCents','deliveryFeeCents','currencyCode','email','deliveryInstructions','deliveryDate','deliveryTimeWindow','metadata'],map:row=>{const {metadata,...rest}=row;return {...rest,couponConsumption:pick(metadata?.couponConsumption,['couponId','clipId','consumedAt']),couponRelease:pick(metadata?.couponRelease,['couponId','clipId','releasedAt','clipRestored','reason','evidenceKind']),fulfillmentMethod:metadata?.fulfillmentMethod,shippingAddress:pick(metadata?.shippingAddressSnapshot,['firstName','lastName','address1','address2','city','province','postalCode','phone']),finalSale:pick(metadata?.finalSale,['status','finalizedAt','subtotalCents','discountCents','taxCents','feeCents','totalCents']),reschedules:(metadata?.deliveryReschedules||[]).map((entry:any)=>({before:pick(entry.before,['deliveryDate','deliveryTimeWindow','selectedFulfillmentSlot']),after:pick(entry.after,['deliveryDate','deliveryTimeWindow','selectedFulfillmentSlot']),customerApproval:typeof entry.customerApproval==='string'?entry.customerApproval:pick(entry.customerApproval,['channel','customer','recordedAt','details'])}))};}},
    orderLines:{model:'orderLineItem',where:orderOwner,fields:['id','orderId','title','sku','quantity','unitPriceCents']},
    actuals:{model:'orderLineFulfillment',where:lineOwner,fields:['id','lineItemId','resolution','productTitle','productSku','unitOfMeasure','quantityMilli','grossMilli','tareMilli','unitPriceCents','subtotalCents','taxRateBasisPoints','createdAt','evidence'],map:row=>{const {evidence,...rest}=row;return {...rest,reason:evidence?.reason,consent:pick(evidence?.consent,['channel','customer','recordedAt','details'])};}},
    substitutions:{model:'orderItemSubstitution',where:lineOwner,fields:['id','lineItemId','originalProduct','substitutedProduct','reason','customerApproved','approvedAt','createdAt']},
    settlements:{model:'orderSettlement',where:orderOwner,fields:['id','orderId','status','totalCents','createdAt','providerEvidence'],map:row=>{const {providerEvidence,...rest}=row;return {...rest,customerApproval:pick(providerEvidence?.customerApproval,['at','totalCents'])};}},
    payments:{model:'payment',where:orderOwner,fields:['id','orderId','status','amountCents','paymentMethod','processedAt','createdAt']},
    refunds:{model:'paymentRefund',where:{payment:orderOwner},fields:['id','paymentId','status','amountCents','requestedAt','processedAt','providerData'],map:row=>{const {providerData,...rest}=row;return {...rest,reason:providerData?.requestReason,commercialAdjustments:pick(providerData?.commercialAdjustments,['kind','netGoodsCents','taxCents','discountCents','totalCents','currencyCode'])};}},
    lineRefunds:{model:'orderLineRefund',where:orderOwner,fields:['id','orderId','lineItemId','paymentRefundId','productTitle','quantityMilli','unitOfMeasure','subtotalCents','discountCents','netGoodsCents','taxCents','totalCents','currencyCode','disposition','conditionNote','reason','status','processedAt']},
    addresses:{model:'address',where:owner,fields:['id','firstName','lastName','company','address1','address2','city','province','postalCode','phone']},
    notificationPreferences:{model:'notificationPreference',where:owner,fields:['id','orderUpdates','deliveryAlerts','priceDrops','backInStock','weeklyDeals','channels','updatedAt']},
    substitutionPreferences:{model:'substitutionPreference',where:owner,fields:['id','allowSubstitutions','preferSimilarBrand','preferSimilarSize','contactBeforeSubstitute','updatedAt']},
    shoppingLists:{model:'shoppingList',where:owner,fields:['id','name','isDefault','createdAt']},
    shoppingListItems:{model:'shoppingListItem',where:{list:owner},fields:['id','listId','product','quantity','unit','checked','notes','addedAt']},
    favorites:{model:'favoriteProduct',where:owner,fields:['id','product','favoritedAt']},
    priceAlerts:{model:'priceAlert',where:owner,fields:['id','product','targetPrice','currentPrice','isTriggered','notifiedAt']},
    stockAlerts:{model:'backInStockAlert',where:owner,fields:['id','product','isActive','createdAt','notifiedAt']},
    coupons:{model:'userCoupon',where:owner,fields:['id','couponId','clippedAt','used','usedAt','usedByOrderId']},
    loyalty:{model:'loyaltyTransaction',where:own,fields:['id','orderId','points','type','description','balanceBefore','balanceAfter','transactionDate','expiresAt']},
    redemptions:{model:'loyaltyRedemption',where:own,fields:['id','orderId','points','discountCents','status','usedAt','createdAt']},
    subscriptions:{model:'subscription',where:own,fields:['id','product','quantity','frequency','nextDeliveryDate','scheduleTimezone','status','isActive','pausedUntil','createdAt','consent','events'],map:row=>({...row,consent:pick(row.consent,['approveEachOrder','at','policy']),events:publicEvents(row.events)})},
    subscriptionRuns:{model:'subscriptionRun',where:own,fields:['id','subscriptionId','dueAt','status','productTitle','quantity','priceCents','orderId','failureReason','events'],map:row=>({...row,events:publicEvents(row.events)})},
    messages:{model:'customerMessage',where:own,fields:['id','orderId','recipient','subject','body','channel','status','attempts','sentAt','createdAt'],map:row=>({...row,body:String(row.body||'').replace(/https?:\/\/\S+\/order-access#\S+/g,'[Private access link omitted]')})},
    carts:{model:'cart',where:{customerId:user.id,storeId:user.storeId},fields:['id','subtotalCents','itemCount','createdAt','updatedAt']},
    cartItems:{model:'cartItem',where:{cart:{customerId:user.id,storeId:user.storeId}},fields:['id','cartId','productId','quantity','subtotalCents','substitutionPreference','addedAt']},
    privacyRequests:{model:'customerPrivacyRequest',where:own,fields:['id','kind','status','policyVersion','reviewReason','createdAt','reviewedAt','eligibleAt','completedAt']},
  };
  const config=configuration[collection], afterId=args.afterId || (collection==='orders'?args.afterOrderId:undefined);
  const rows=await tx[config.model].findMany({where:{...config.where,...(afterId?{id:{gt:afterId}}:{})},orderBy:{id:'asc'},take:101,select:Object.fromEntries(config.fields.map(field=>[field,true]))});
  const hasMore=rows.length>100, records=rows.slice(0,100).map((row:any)=>config.map?config.map(row):row);
  if(!hasMore) await context.transaction(async(tc:any)=>{
    await tc.prisma.$queryRawUnsafe('SELECT "id" FROM "CustomerPrivacyRequest" WHERE "id"=$1 FOR UPDATE',request.id);
    const current=await tc.prisma.customerPrivacyRequest.findUnique({where:{id:request.id}});
    const progress={...(current.resultSummary?.exportProgress||{}),[collection]:true};
    const complete=EXPORT_COLLECTIONS.every(name=>progress[name]);
    await tc.prisma.customerPrivacyRequest.update({where:{id:request.id},data:{status:complete?'completed':'requested',completedAt:complete?new Date():null,resultSummary:{delivery:'Authenticated per-collection paginated download',policyVersion:CUSTOMER_PRIVACY_POLICY.version,exportProgress:progress}}});
  });
  return {policy:CUSTOMER_PRIVACY_POLICY,identity:customerExportIdentity(user),collections:EXPORT_COLLECTIONS,collection,records,nextId:hasMore?records.at(-1)?.id:null,...(collection==='orders'?{orders:records,nextOrderId:hasMore?records.at(-1)?.id:null}:{})};
}
export async function reviewGroceryCustomerErasure(_root: unknown, args: { requestId: string; approve: boolean; reason: string }, context: Context) {
  await requireFreshCapability(context, 'canManageUsers'); const store = await requireSessionStore(context);
  const reason = args.reason.trim(); if (reason.length < 3 || reason.length > 500) throw new Error('A review reason of 3–500 characters is required');
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma as any;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Store" WHERE "id" = $1 FOR UPDATE', store.id);
    const actor = await tx.user.findUnique({ where: { id: context.session!.itemId }, include: { role: true } });
    if (actor?.storeId !== store.id || actor.privacyErasedAt || !actor.role?.canManageUsers) throw new Error('Current staff-administration capability required');
    const request = await tx.customerPrivacyRequest.findUnique({ where: { id: args.requestId } });
    if (!request || request.storeId !== store.id || request.kind !== 'erasure') throw new Error('Erasure request not found in active Store');
    if (request.status === 'completed') return { success: true, status: 'completed', reused: true };
    await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', request.userId);
    const user = await tx.user.findUnique({ where: { id: request.userId } });
    if (!user || user.storeId !== store.id || user.roleId) throw new Error('Staff identities require staff lifecycle administration');
    const review = { reviewedById: context.session!.itemId, reviewedAt: new Date(), reviewReason: reason, policyVersion: CUSTOMER_PRIVACY_POLICY.version };
    if (!args.approve) { await tx.customerPrivacyRequest.update({ where: { id: request.id }, data: { ...review, status: 'rejected' } }); return { success: true, status: 'rejected' }; }
    const activeDelivery = await tx.customerMessage.findFirst({ where: { userId: user.id, storeId: store.id, deliveryLeaseExpiresAt: { gt: new Date() } } });
    if (activeDelivery) { await tx.customerPrivacyRequest.update({ where: { id: request.id }, data: { ...review, status: 'deferred', resultSummary: { reason: 'An authorized message or external event delivery is in progress' } } }); return { success: true, status: 'deferred', message: 'Wait for the active communication delivery to finish before erasure' }; }
    let orders = await tx.order.findMany({ where: { userId: user.id, storeId: store.id }, orderBy: { id: 'asc' } });
    const carts = await tx.cart.findMany({ where: { customerId: user.id, storeId: store.id }, select: { id: true }, orderBy: { id: 'asc' } });
    for (const cart of carts) await tx.$queryRawUnsafe('SELECT \"id\" FROM \"Cart\" WHERE \"id\" = $1 FOR UPDATE', cart.id);
    const pendingSession = await tx.paymentSession.findFirst({ where: { OR: [{ cartId: { in: carts.map((cart: any) => cart.id) } }, { data: { path: ['checkoutOwnerId'], equals: user.id } }], NOT: ['completed','failed','expired'].map(status => ({ data: { path: ['status'], equals: status } })) } });
    if (pendingSession && !['completed','failed','expired'].includes(pendingSession.data?.status)) { await tx.customerPrivacyRequest.update({ where: { id: request.id }, data: { ...review, status: 'deferred', resultSummary: { reason: 'Payment authorization or provider initiation remains unresolved' } } }); return { success: true, status: 'deferred', message: 'Resolve the active checkout authorization before erasure' }; }
    const unresolvedCheckout = await tx.checkoutAttempt.findFirst({ where: { storeId: store.id, OR: [{ cart: { customerId: user.id } }, { requestData: { path: ['checkoutOwnerId'], equals: user.id } }, { order: { userId: user.id } }], status: { notIn: ['finalized','compensated','failed'] } } });
    if (unresolvedCheckout) { await tx.customerPrivacyRequest.update({ where: { id: request.id }, data: { ...review, status: 'deferred', resultSummary: { reason: 'Checkout payment recovery remains unresolved' } } }); return { success: true, status: 'deferred', message: 'Resolve checkout payment recovery before erasure' }; }
    for (const order of orders) await tx.$queryRawUnsafe('SELECT \"id\" FROM \"Order\" WHERE \"id\" = $1 FOR UPDATE', order.id);
    orders = await tx.order.findMany({ where: { userId: user.id, storeId: store.id }, orderBy: { id: 'asc' } });
    let finances = await tx.payment.findMany({ where: { orderId: { in: orders.map((order: any) => order.id) }, storeId: store.id }, orderBy: { id: 'asc' } });
    for (const payment of finances) await tx.$queryRawUnsafe('SELECT \"id\" FROM \"Payment\" WHERE \"id\" = $1 FOR UPDATE', payment.id);
    finances = await tx.payment.findMany({ where: { orderId: { in: orders.map((order: any) => order.id) }, storeId: store.id }, orderBy: { id: 'asc' } });
    const openRefund = await tx.paymentRefund.findFirst({ where: { paymentId: { in: finances.map((payment: any) => payment.id) }, status: 'processing' } });
    const openSettlement = await tx.orderSettlement.findFirst({ where: { orderId: { in: orders.map((order: any) => order.id) }, status: { in: ['processing','requires_customer_authorization'] } } });
    if (openRefund || openSettlement || finances.some((payment: any) => ['authorized','pending','processing'].includes(payment.status))) { await tx.customerPrivacyRequest.update({ where: { id: request.id }, data: { ...review, status: 'deferred', resultSummary: { reason: 'Financial settlement or refund remains unresolved' } } }); return { success: true, status: 'deferred', message: 'Resolve financial processing before erasure' }; }
    const eligibility = privacyErasureEligibility(orders);
    if (!eligibility.eligible) { await tx.customerPrivacyRequest.update({ where: { id: request.id }, data: { ...review, status: 'deferred', eligibleAt: eligibility.eligibleAt, resultSummary: { retained: 'commerce and account evidence', reason: eligibility.reason } } }); return { success: true, status: 'deferred', eligibleAt: eligibility.eligibleAt, message: eligibility.reason }; }
    for (const order of orders) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', order.id);
      await tx.order.update({ where: { id: order.id }, data: { email: `erased-${user.id}@invalid.local`, deliveryInstructions: '', metadata: scrubOrderContactMetadata(order.metadata) } });
    }
    const orderIds = orders.map((order: any) => order.id);
    const fulfillmentRows = await tx.orderLineFulfillment.findMany({ where: { lineItem: { orderId: { in: orderIds } } } });
    for (const row of fulfillmentRows) await tx.orderLineFulfillment.update({ where: { id: row.id }, data: { evidence: scrubOrderContactMetadata(row.evidence) } });
    await tx.orderItemSubstitution.updateMany({ where: { lineItem: { orderId: { in: orderIds } } }, data: { reason: '[redacted after privacy review]' } });
    const lineRefunds = await tx.orderLineRefund.findMany({ where: { orderId: { in: orderIds } } });
    for (const row of lineRefunds) await tx.orderLineRefund.update({ where: { id: row.id }, data: { reason: '[redacted after privacy review]', conditionNote: '', failureMessage: '', events: (Array.isArray(row.events) ? row.events : []).map(scrubOrderContactMetadata), returnedLots: (Array.isArray(row.returnedLots) ? row.returnedLots : []).map(scrubOrderContactMetadata) } });
    const settlements = await tx.orderSettlement.findMany({ where: { orderId: { in: orderIds } } });
    for (const row of settlements) await tx.orderSettlement.update({ where: { id: row.id }, data: { snapshot: scrubOrderContactMetadata(row.snapshot), providerEvidence: scrubOrderContactMetadata(row.providerEvidence) } });
    const paymentRows = await tx.payment.findMany({ where: { orderId: { in: orderIds }, storeId: store.id } });
    for (const row of paymentRows) await tx.payment.update({ where: { id: row.id }, data: { providerData: scrubOrderContactMetadata(row.providerData) } });
    const webhookEvents = await tx.paymentWebhookEvent.findMany({ where: { paymentRecordId: { in: paymentRows.map((payment: any) => payment.id) }, storeId: store.id } });
    for (const event of webhookEvents) await tx.paymentWebhookEvent.update({ where: { id: event.id }, data: { verifiedPayload: scrubOrderContactMetadata(event.verifiedPayload) } });
    const refunds = await tx.paymentRefund.findMany({ where: { paymentId: { in: paymentRows.map((payment: any) => payment.id) } } });
    for (const row of refunds) await tx.paymentRefund.update({ where: { id: row.id }, data: { providerData: scrubOrderContactMetadata(row.providerData), failureMessage: '' } });
    await tx.checkoutAttempt.updateMany({ where: { storeId: store.id, OR: [{ cart: { customerId: user.id } }, { requestData: { path: ['checkoutOwnerId'], equals: user.id } }, { order: { userId: user.id } }] }, data: { requestData: { privacy: { pseudonymized: true, policyVersion: CUSTOMER_PRIVACY_POLICY.version } } } });
    const sessions = await tx.paymentSession.findMany({ where: { OR: [{ cartId: { in: carts.map((cart: any) => cart.id) } }, { checkoutAttempts: { some: { orderId: { in: orderIds } } } }] } });
    for (const session of sessions) await tx.paymentSession.update({ where: { id: session.id }, data: { data: scrubOrderContactMetadata(session.data) } });
    const outbox = await tx.groceryOutboxEvent.findMany({ where: { storeId: store.id, OR: [{ aggregateId: { in: [user.id, ...orderIds, ...paymentRows.map((payment: any) => payment.id)] } }, { payload: { path: ['userId'], equals: user.id } }, ...orderIds.map((orderId: string) => ({ payload: { path: ['orderId'], equals: orderId } }))] } });
    const redactedEventHashes = [];
    for (const event of outbox) {
      const payload = scrubOrderContactMetadata(event.payload);
      redactedEventHashes.push({ eventId: event.id, originalPayloadHash: event.payloadHash });
      await tx.groceryOutboxEvent.update({ where: { id: event.id }, data: { payload, payloadHash: groceryOutboxPayloadHash(payload), status: 'suppressed', claimToken: '', lastError: 'Suppressed after approved privacy retention review' } });
    }
    await tx.customerMessage.updateMany({ where: { storeId: store.id, OR: [{ userId: user.id }, { orderId: { in: orderIds } }, { recipient: user.email }] }, data: { recipient: '[erased]', subject: '[erased]', body: '[erased]', status: 'suppressed', failureMessage: '', providerEvidence: { privacy: { pseudonymized: true } } } });
    const subscriptions = await tx.subscription.findMany({ where: { userId: user.id, storeId: store.id } });
    for (const row of subscriptions) await tx.subscription.update({ where: { id: row.id }, data: { status: 'cancelled', isActive: false, consent: scrubOrderContactMetadata(row.consent), events: (Array.isArray(row.events) ? row.events : []).map(scrubOrderContactMetadata) } });
    const recurringRuns = await tx.subscriptionRun.findMany({ where: { userId: user.id, storeId: store.id } });
    for (const row of recurringRuns) await tx.subscriptionRun.update({ where: { id: row.id }, data: { failureReason: '', events: (Array.isArray(row.events) ? row.events : []).map(scrubOrderContactMetadata) } });
    const rewards = await tx.loyaltyTransaction.findMany({ where: { userId: user.id, storeId: store.id } });
    for (const row of rewards) await tx.loyaltyTransaction.update({ where: { id: row.id }, data: { description: 'Retained pseudonymous rewards entry', metadata: scrubOrderContactMetadata(row.metadata) } });
    const redemptions = await tx.loyaltyRedemption.findMany({ where: { userId: user.id, storeId: store.id } });
    for (const row of redemptions) await tx.loyaltyRedemption.update({ where: { id: row.id }, data: { events: (Array.isArray(row.events) ? row.events : []).map(scrubOrderContactMetadata) } });
    const requestedLines = await tx.orderLineItem.findMany({ where: { orderId: { in: orderIds } } });
    for (const row of requestedLines) await tx.orderLineItem.update({ where: { id: row.id }, data: { metadata: scrubOrderContactMetadata(row.metadata) } });
    await tx.substitutionPreference.deleteMany({ where: { userId: user.id } });
    const routes = await tx.deliveryRoute.findMany({ where: { storeId: store.id, orders: { some: { id: { in: orderIds } } } } });
    for (const route of routes) await tx.deliveryRoute.update({ where: { id: route.id }, data: { stops: (Array.isArray(route.stops) ? route.stops : []).map((stop: any) => orderIds.includes(stop.orderId) ? scrubOrderContactMetadata(stop) : stop) } });
    await tx.address.updateMany({ where: { userId: user.id }, data: { firstName: '', lastName: '', company: '', address1: '[erased]', address2: '', city: '[erased]', province: '', postalCode: '[erased]', phone: '' } });
    const lists = await tx.shoppingList.findMany({ where: { userId: user.id }, select: { id: true } });
    await tx.shoppingListItem.deleteMany({ where: { listId: { in: lists.map((list: any) => list.id) } } });
    await tx.shoppingList.deleteMany({ where: { userId: user.id } });
    await tx.cartItem.deleteMany({ where: { cartId: { in: carts.map((cart: any) => cart.id) } } });
    for (const cart of carts) await tx.cart.update({ where: { id: cart.id }, data: { customerId: null, sessionId: randomBytes(32).toString('hex'), subtotal: 0, subtotalCents: 0, itemCount: 0 } });
    await tx.notificationPreference.deleteMany({ where: { userId: user.id } });
    await tx.favoriteProduct.deleteMany({ where: { userId: user.id } });
    await tx.priceAlert.deleteMany({ where: { userId: user.id } });
    await tx.backInStockAlert.deleteMany({ where: { userId: user.id } });
    await transactionContext.sudo().db.User.updateOne({ where: { id: user.id }, data: { name: 'Erased customer', email: `erased-${user.id}@invalid.local`, password: randomBytes(48).toString('base64url') } });
    await tx.user.update({ where: { id: user.id }, data: { privacyErasedAt: new Date() } });
    await tx.customerPrivacyRequest.update({ where: { id: request.id }, data: { ...review, status: 'completed', completedAt: new Date(), resultSummary: { retained: 'Pseudonymous transaction, inventory and audit identifiers; monetary records unchanged', erased: 'Account identity, addresses, nested order/fulfillment/delivery contact, checkout data, message content, reusable lists and notification preferences', redactedEventHashes, policyVersion: CUSTOMER_PRIVACY_POLICY.version } } });
    return { success: true, status: 'completed' };
  });
}
