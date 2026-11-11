export function communicationAllowed(type:string,preference:any) {
  // Preference check only; nothing in this app sends email or texts.
  if (preference && Array.isArray(preference.channels) && !preference.channels.includes('email')) return false;
  if(type==='product.back_in_stock') return preference?.backInStock!==false;
  if(type==='product.price_drop') return preference?.priceDrops!==false;
  if(type==='order.dispatched') return preference?.deliveryAlerts!==false;
  return preference?.orderUpdates!==false;
}
