import { updateDeliveryPolicyAction } from '../actions';
export function DeliveryPolicyForm({policy}: {policy:any}) {
  return <form action={updateDeliveryPolicyAction} className="space-y-3 p-4">
    <label className="block text-sm">Delivery postal prefixes (comma separated)<input name="postalPrefixes" defaultValue={(policy?.postalPrefixes || []).join(', ')} className="mt-1 block w-full rounded border p-2" required placeholder="94107, 94110" /></label>
    <p className="text-xs text-muted-foreground">Only matching addresses can authorize delivery payment. Slot fees are added to the area fee.</p>
    {([['pickupMinimumCents','Pickup minimum (cents)'],['deliveryMinimumCents','Delivery minimum (cents)'],['deliveryFeeCents','Area fee (cents)'],['feeTaxRateBasisPoints','Fee tax (basis points)']] as const).map(([key,label])=><label className="block text-sm" key={key}>{label}<input className="mt-1 block rounded border p-2" type="number" min="0" step="1" name={key} defaultValue={policy?.[key] || 0} required /></label>)}
    <button className="rounded border px-4 py-2 text-sm" type="submit">Save service area and minimums</button>
  </form>;
}
