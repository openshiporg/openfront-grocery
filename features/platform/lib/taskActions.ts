'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient, staffErrorMessage } from '@/features/platform/lib/platformClient';
import { storefrontGraphQL } from '@/features/storefront/lib/data/graphql';
import { parseInventoryAdjustmentForm, parseInventoryQuantityInput } from '@/features/platform/inventory/lib/inventoryQuantityInput';

export type TaskResult<T = any> = { ok: true; data: T } | { ok: false; error: string };

// Business errors are returned, not thrown: production Next.js replaces messages thrown from
// server actions with a generic Server Components error.
async function run(query: string, variables: Record<string, unknown>): Promise<TaskResult> {
  const response = await keystoneClient<any>(query, variables, { cache: 'no-store' });
  if (!response.success) return { ok: false, error: response.error || 'The request could not be completed' };
  revalidatePath('/dashboard/platform');
  return { ok: true, data: response.data };
}

export async function reconcileCheckoutTask() {
  return run(`mutation{ reconcileCheckoutAttempts(limit:20){ processed results } }`, {});
}

export async function advanceOrderTask(orderId: string, target: string) {
  return run(`mutation($orderId:ID!,$target:String!){ advanceOrderFulfillment(orderId:$orderId,target:$target){ success orderId status stage reused message } }`, { orderId, target });
}

export async function cancelOrderTask(input: { orderId: string; reason: string; idempotencyKey: string; disposition?: string; conditionNote?: string }) {
  return run(`mutation($orderId:ID!,$reason:String!,$idempotencyKey:String!,$disposition:String,$conditionNote:String){ cancelGroceryOrder(orderId:$orderId,reason:$reason,idempotencyKey:$idempotencyKey,disposition:$disposition,conditionNote:$conditionNote){ success orderId status reused } }`, input);
}

export type RefundTaskResult =
  | { ok: true; data: { refundId?: string; amountCents?: number; status?: string; reused?: boolean; message?: string } }
  | { ok: false; error: string; uncertain: boolean };

/**
 * A rejected refund (GraphQL error) is definite; a transport failure leaves the
 * outcome unknown, and the client must resubmit the same request to learn it.
 */
export async function refundOrderPaymentTask(input: { paymentId: string; amountCents: number; reason: string; idempotencyKey: string }): Promise<RefundTaskResult> {
  const response = await keystoneClient<any>(`mutation($paymentId:ID!,$amountCents:Int!,$reason:String!,$idempotencyKey:String!){ refundPayment(paymentId:$paymentId,amountCents:$amountCents,reason:$reason,idempotencyKey:$idempotencyKey){ success refundId paymentId amountCents status reused message } }`, input, { cache: 'no-store' });
  if (!response.success) return { ok: false, error: response.error || 'The refund could not be confirmed.', uncertain: !response.errors?.length };
  revalidatePath('/dashboard/platform');
  return { ok: true, data: response.data?.refundPayment || {} };
}

export async function adjustInventoryTask(inventoryLotId: string, targetQuantityRemaining: number, reason = 'correction', note?: string) {
  const normalizedTarget = parseInventoryQuantityInput(targetQuantityRemaining);
  return run(`mutation($inventoryLotId:ID!,$targetQuantityRemaining:Float!,$reason:String!,$note:String,$idempotencyKey:String!){ adjustInventoryLot(inventoryLotId:$inventoryLotId,targetQuantityRemaining:$targetQuantityRemaining,reason:$reason,note:$note,idempotencyKey:$idempotencyKey){ success inventoryLotId quantityRemaining productStock quantityDelta reused } }`, { inventoryLotId, targetQuantityRemaining: normalizedTarget, reason, note: note || null, idempotencyKey: `platform:${inventoryLotId}:${normalizedTarget}:${reason}:${Date.now()}` });
}

export type InventoryAdjustmentState = { ok: boolean; error: string | null; message: string | null; values?: { targetQuantityRemaining: string; reason: string; note: string } };

/** A count correction reports its outcome to the form, keeping what was entered on failure. */
export async function adjustInventoryFormTask(_previous: InventoryAdjustmentState, formData: FormData): Promise<InventoryAdjustmentState> {
  const values = { targetQuantityRemaining: String(formData.get('targetQuantityRemaining') ?? ''), reason: String(formData.get('reason') || 'correction'), note: String(formData.get('note') || '') };
  let input: ReturnType<typeof parseInventoryAdjustmentForm>;
  try { input = parseInventoryAdjustmentForm(formData); } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Enter the counted quantity.', message: null, values };
  }
  const result = await adjustInventoryTask(input.inventoryLotId, input.targetQuantityRemaining, input.reason, input.note);
  if (!result.ok) return { ok: false, error: result.error, message: null, values };
  const saved = result.data?.adjustInventoryLot;
  return { ok: true, error: null, message: `Count saved. ${saved?.quantityRemaining ?? input.targetQuantityRemaining} remaining.` };
}

/**
 * The client keeps `idempotencyKey` for the exact reviewed draft, so a retry
 * after an uncertain response returns the original draft instead of a second one.
 */
export async function createPurchaseOrderTask(input: { idempotencyKey: string; supplierId: string; items: Array<{ productId: string; quantity: number; unitCostCents: number }>; expectedDeliveryDate?: string; notes?: string }) {
  return run(`mutation($idempotencyKey:String!,$supplierId:ID!,$expectedDeliveryDate:String,$notes:String,$items:[PurchaseOrderDraftItemInput!]!){ createPurchaseOrderDraft(idempotencyKey:$idempotencyKey,supplierId:$supplierId,expectedDeliveryDate:$expectedDeliveryDate,notes:$notes,items:$items){ success purchaseOrderId poNumber status totalAmount itemCount reused } }`, {
    idempotencyKey: input.idempotencyKey,
    supplierId: input.supplierId,
    expectedDeliveryDate: input.expectedDeliveryDate || null,
    notes: input.notes?.trim().slice(0, 1000) || null,
    items: input.items.map((item) => ({ productId: item.productId, quantity: item.quantity, unitCost: item.unitCostCents / 100 })),
  });
}

export async function transitionPurchaseOrderTask(purchaseOrderId: string, status: string) {
  return run(`mutation($purchaseOrderId:ID!,$status:String!){ transitionPurchaseOrder(purchaseOrderId:$purchaseOrderId,status:$status){ success purchaseOrderId status message } }`, { purchaseOrderId, status });
}

export type PurchaseReceiptLine = { receiptKey: string; poItemId: string; targetQuantityReceived: number; lotNumber: string; expirationDate: string; location?: string; conditionStatus: string; inspectionNote: string; deliveryReference: string };

export async function receivePurchaseOrderTask(purchaseOrderId: string, receipts: PurchaseReceiptLine[]) {
  try {
    const result = await run(`mutation($purchaseOrderId:ID!,$receipts:[PurchaseOrderReceiptInput!]!){ receivePurchaseOrder(purchaseOrderId:$purchaseOrderId,receipts:$receipts){ success purchaseOrderId status message } }`, { purchaseOrderId, receipts });
    if (result.ok) return { ok: true as const, data: result.data };
    if (!/unexpected error/i.test(result.error)) return { ok: false as const, error: result.error };
  } catch { /* Fall through to the receipt guidance below. */ }
  return {
    ok: false as const,
    error: 'Receipt could not be recorded. Check that the lot number is unique, the expiry is in the future, and cumulative quantities do not exceed the purchase order.',
  };
}

export async function updateCouponTask(id: string, isActive: boolean) {
  return run(`mutation($id:ID!,$data:CouponUpdateInput!){ updateCoupon(where:{id:$id},data:$data){ id isActive } }`, { id, data: { isActive } });
}

export type ProvisionCustomerState = { ok: boolean; error: string | null; message: string | null; values?: { name: string; email: string } };

/** Provision a shopper; errors come back to the form (never the password). */
export async function provisionCustomerTask(_previous: ProvisionCustomerState, formData: FormData): Promise<ProvisionCustomerState> {
  const name = String(formData.get('name') || '');
  const email = String(formData.get('email') || '');
  const temporaryPassword = String(formData.get('temporaryPassword') || '');
  // Carries a password, so it uses the storefront client: the shared dashboard client logs
  // failed requests together with their variables.
  try {
    const result = await storefrontGraphQL(`mutation($name:String!,$email:String!,$temporaryPassword:String!){ provisionGroceryCustomer(name:$name,email:$email,temporaryPassword:$temporaryPassword){ success customerId email } }`, { name, email, temporaryPassword }, { cache: 'no-store' });
    if (result.errors?.length || !result.data?.provisionGroceryCustomer?.success) {
      return { ok: false, error: staffErrorMessage(result.errors?.map((error) => error.message || '').join('\n'), 'The customer account could not be created.'), message: null, values: { name, email } };
    }
  } catch {
    return { ok: false, error: 'We couldn’t confirm whether the account was created. Search the directory for this email before trying again.', message: null, values: { name, email } };
  }
  revalidatePath('/dashboard/platform');
  return { ok: true, error: null, message: `Created a customer account for ${email}.` };
}
