import { keystoneClient } from '@/features/platform/lib/platformClient';
import { InventorySafetyControls } from './InventorySafetyControls';

const OPEN_LIMIT = 200;
const RECENT_LIMIT = 20;

/**
 * Open recalls and counts (the work), plus a short recent history — not every
 * historical record on every render. Totals of open work are counted on the
 * server. Recall order links show the human order number when the actor can
 * read orders; the internal ID stays in the recall evidence.
 */
export async function InventorySafetyPanel({ lots }: { lots: Array<{ id: string; lotNumber: string }> }) {
  const recallFields = 'id reason status scope affectedOrders events createdAt';
  const countFields = 'id status expectedQuantity observedQuantity recountQuantity observedBy recountedBy inventoryLot { id lotNumber } createdAt';
  const response = await keystoneClient<any>(`query($open:Int!,$recent:Int!){
    openRecalls: inventoryRecalls(where:{status:{equals:"open"}},take:$open,orderBy:[{createdAt:desc}]){${recallFields}}
    recentRecalls: inventoryRecalls(where:{status:{not:{equals:"open"}}},take:$recent,orderBy:[{createdAt:desc}]){${recallFields}}
    openRecallCount: inventoryRecallsCount(where:{status:{equals:"open"}})
    openCounts: inventoryCounts(where:{status:{not:{equals:"approved"}}},take:$open,orderBy:[{createdAt:desc}]){${countFields}}
    recentCounts: inventoryCounts(where:{status:{equals:"approved"}},take:$recent,orderBy:[{createdAt:desc}]){${countFields}}
    openCountCount: inventoryCountsCount(where:{status:{not:{equals:"approved"}}})
  }`, { open: OPEN_LIMIT, recent: RECENT_LIMIT }, { cache: 'no-store' });
  if (!response.success) return <InventorySafetyControls lots={lots} recalls={[]} counts={[]} loadError={response.error || 'Safety records could not be loaded.'} />;
  const data = response.data || {};
  const recalls = [...(data.openRecalls || []), ...(data.recentRecalls || [])];
  const counts = [...(data.openCounts || []), ...(data.recentCounts || [])];
  const orderIds = [...new Set(recalls.flatMap((recall: any) => (recall.affectedOrders || []).map((order: any) => order.orderId)).filter(Boolean))].slice(0, 500);
  const numbers = orderIds.length
    ? await keystoneClient<any>('query($ids:[ID!]){orders(where:{id:{in:$ids}}){id displayId}}', { ids: orderIds }, { cache: 'no-store' })
    : null;
  const orderNumbers: Record<string, number> = Object.fromEntries((numbers?.success ? numbers.data?.orders || [] : []).map((order: any) => [order.id, order.displayId]));
  const truncated = Number(data.openRecallCount || 0) > OPEN_LIMIT || Number(data.openCountCount || 0) > OPEN_LIMIT;
  return <InventorySafetyControls lots={lots} recalls={recalls} counts={counts} orderNumbers={orderNumbers}
    loadError={truncated ? `Showing the newest ${OPEN_LIMIT} open recalls and counts; resolve these to see the rest.` : undefined} />;
}
