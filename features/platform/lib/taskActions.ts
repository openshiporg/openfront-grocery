'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

async function run(query: string, variables: Record<string, unknown>) {
  const response = await keystoneClient<any>(query, variables, { cache: 'no-store' });
  if (!response.success) throw new Error(response.error);
  revalidatePath('/dashboard/platform');
  return response.data;
}

export async function reconcileCheckoutTask() {
  return run(`mutation{ reconcileCheckoutAttempts(limit:20){ processed results } }`, {});
}

export async function advanceOrderTask(orderId: string, target: string) {
  return run(`mutation($orderId:ID!,$target:String!){ advanceOrderFulfillment(orderId:$orderId,target:$target){ success orderId status stage reused message } }`, { orderId, target });
}

export async function cancelOrderTask(input: { orderId: string; reason: string; idempotencyKey: string }) {
  return run(`mutation($orderId:ID!,$reason:String!,$idempotencyKey:String!){ cancelGroceryOrder(orderId:$orderId,reason:$reason,idempotencyKey:$idempotencyKey){ success orderId status reused } }`, input);
}

export async function refundOrderPaymentTask(input: { paymentId: string; amountCents: number; reason: string; idempotencyKey: string }) {
  return run(`mutation($paymentId:ID!,$amountCents:Int!,$reason:String!,$idempotencyKey:String!){ refundPayment(paymentId:$paymentId,amountCents:$amountCents,reason:$reason,idempotencyKey:$idempotencyKey){ success refundId paymentId amountCents status reused message } }`, input);
}

export async function adjustInventoryTask(inventoryLotId: string, targetQuantityRemaining: number, reason = 'correction', note?: string) {
  return run(`mutation($inventoryLotId:ID!,$targetQuantityRemaining:Int!,$reason:String!,$note:String,$idempotencyKey:String!){ adjustInventoryLot(inventoryLotId:$inventoryLotId,targetQuantityRemaining:$targetQuantityRemaining,reason:$reason,note:$note,idempotencyKey:$idempotencyKey){ success inventoryLotId quantityRemaining productStock quantityDelta reused } }`, { inventoryLotId, targetQuantityRemaining, reason, note: note || null, idempotencyKey: `platform:${inventoryLotId}:${targetQuantityRemaining}:${reason}:${Date.now()}` });
}

export async function adjustInventoryFormTask(formData: FormData) {
  const inventoryLotId = String(formData.get('inventoryLotId') || '');
  const targetQuantityRemaining = Number(formData.get('targetQuantityRemaining'));
  const reason = String(formData.get('reason') || 'correction');
  const note = String(formData.get('note') || '');
  if (!inventoryLotId || !Number.isInteger(targetQuantityRemaining)) throw new Error('Lot and whole-unit target count are required');
  await adjustInventoryTask(inventoryLotId, targetQuantityRemaining, reason, note);
}

export async function createPurchaseOrderTask(input: { supplierId: string; productId: string; quantity: number; unitCost: number; expectedDeliveryDate?: string }) {
  return run(`mutation($idempotencyKey:String!,$supplierId:ID!,$expectedDeliveryDate:String,$items:[PurchaseOrderDraftItemInput!]!){ createPurchaseOrderDraft(idempotencyKey:$idempotencyKey,supplierId:$supplierId,expectedDeliveryDate:$expectedDeliveryDate,items:$items){ success purchaseOrderId poNumber status totalAmount itemCount reused } }`, {
    idempotencyKey: `platform-po:${input.supplierId}:${input.productId}:${input.quantity}:${Date.now()}`,
    supplierId: input.supplierId,
    expectedDeliveryDate: input.expectedDeliveryDate || null,
    items: [{ productId: input.productId, quantity: input.quantity, unitCost: input.unitCost }],
  });
}

export async function transitionPurchaseOrderTask(purchaseOrderId: string, status: string) {
  return run(`mutation($purchaseOrderId:ID!,$status:String!){ transitionPurchaseOrder(purchaseOrderId:$purchaseOrderId,status:$status){ success purchaseOrderId status message } }`, { purchaseOrderId, status });
}

export async function receivePurchaseOrderTask(purchaseOrderId: string, receipts: Array<{ poItemId: string; targetQuantityReceived: number; lotNumber: string; expirationDate: string; location?: string }>) {
  return run(`mutation($purchaseOrderId:ID!,$receipts:[PurchaseOrderReceiptInput!]!){ receivePurchaseOrder(purchaseOrderId:$purchaseOrderId,receipts:$receipts){ success purchaseOrderId status message } }`, { purchaseOrderId, receipts });
}

export async function updateSupplierTask(id: string, paymentTerms: string) {
  return run(`mutation($id:ID!,$data:SupplierUpdateInput!){ updateSupplier(where:{id:$id},data:$data){ id paymentTerms } }`, { id, data: { paymentTerms } });
}

export async function updateCouponTask(id: string, isActive: boolean) {
  return run(`mutation($id:ID!,$data:CouponUpdateInput!){ updateCoupon(where:{id:$id},data:$data){ id isActive } }`, { id, data: { isActive } });
}

export async function provisionCustomerTask(formData: FormData) {
  const name = String(formData.get('name') || '');
  const email = String(formData.get('email') || '');
  const temporaryPassword = String(formData.get('temporaryPassword') || '');
  await run(`mutation($name:String!,$email:String!,$temporaryPassword:String!){ provisionGroceryCustomer(name:$name,email:$email,temporaryPassword:$temporaryPassword){ success customerId email } }`, { name, email, temporaryPassword });
}
