import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { InventorySafetyControls } from './InventorySafetyControls';

export async function InventorySafetyPanel({ lots }: { lots: Array<{ id: string; lotNumber: string }> }) {
  const recalls: any[] = [], counts: any[] = [];
  let error: string | undefined;
  for (const [list, selection, rows] of [
    ['inventoryRecalls', 'id reason status scope affectedOrders events createdAt', recalls],
    ['inventoryCounts', 'id status expectedQuantity observedQuantity recountQuantity observedBy recountedBy inventoryLot { id lotNumber } createdAt', counts],
  ] as const) {
    for (let skip = 0; ; skip += 100) {
      const response = await keystoneClient<any>(`query($skip:Int!){${list}(take:100,skip:$skip,orderBy:[{createdAt:desc}]){${selection}}}`, { skip }, { cache: 'no-store' });
      if (!response.success) { error = response.error; break; }
      const page = response.data?.[list] || [];
      rows.push(...page);
      if (page.length < 100) break;
    }
  }
  return <InventorySafetyControls lots={lots} recalls={recalls} counts={counts} loadError={error} />;
}
