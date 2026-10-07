export function isInventoryLotEligible(lot: { expirationDate: Date | string; safetyStatus?: string | null; conditionStatus?: string | null }, promisedAt = new Date()) {
  return lot.safetyStatus === 'available'
    && lot.conditionStatus === 'accepted'
    && Number.isFinite(new Date(lot.expirationDate).getTime())
    && new Date(lot.expirationDate).getTime() > promisedAt.getTime();
}

/** Keep original and actual provenance when tracing safety incidents. */
export function traceAffectedOrders(orders: any[], lotIds: string[]) {
  const scope = new Set(lotIds);
  return orders.flatMap((order) => {
    const lines = (order.lineItems || []).flatMap((line: any) => {
      const allocations = [...(line.inventoryAllocations || []), ...(line.fulfillment?.allocations || []), ...((line.metadata as any)?.inventoryAllocations || [])];
      const ids = [line.inventoryLotId, ...allocations.map((allocation: any) => allocation.inventoryLotId || allocation.lotId)];
      return ids.some((id) => scope.has(id)) ? [{ lineItemId: line.id, lotIds: [...new Set(ids.filter((id) => scope.has(id)))] }] : [];
    });
    return lines.length ? [{ orderId: order.id, status: order.status, customerId: order.userId || order.customerId || null, email: order.email || order.customerEmail || order.user?.email || null, lines }] : [];
  });
}

/** Caller holds the order lock; this shares Product → Lot lock order with allocation. */
export async function assertOrderInventoryEligible(tx: any, orderId: string, storeId: string, promisedAt = new Date()) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { lineItems: { include: { inventoryAllocations: true, fulfillment: true } } } });
  if (!order || order.storeId !== storeId) throw new Error('Order not found in active store');
  const allocations = order.lineItems.flatMap((line: any) => line.fulfillment
    ? line.fulfillment.allocations || []
    : line.inventoryAllocations?.length ? line.inventoryAllocations : line.metadata?.inventoryAllocations || (line.inventoryLotId ? [{ lotId: line.inventoryLotId, productId: line.productId }] : []));
  const lotIds: string[] = [...new Set<string>(allocations.map((allocation: any) => allocation.lotId || allocation.inventoryLotId))].sort();
  const identities = await tx.inventoryLot.findMany({ where: { id: { in: lotIds }, storeId }, select: { id: true, productId: true } });
  if (identities.length !== lotIds.length) throw new Error('Order allocation lot is missing or outside the active store');
  for (const productId of [...new Set<string>(identities.map((lot: any) => lot.productId))].sort()) await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', productId);
  for (const lotId of lotIds) {
    await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', lotId);
    const lot = await tx.inventoryLot.findUnique({ where: { id: lotId } });
    if (!lot || lot.storeId !== storeId || !isInventoryLotEligible(lot, promisedAt)) throw new Error('Order contains held, recalled, quarantined, uninspected, unknown or expired stock; resolve actual goods before fulfillment');
  }
}
