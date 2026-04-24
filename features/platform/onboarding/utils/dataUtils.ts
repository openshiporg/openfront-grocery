import { STORE_TEMPLATES, type SeedSectionKey, type TemplateType } from '../config/templates';

const SECTION_KEYS: SeedSectionKey[] = [
  'departments',
  'suppliers',
  'products',
  'inventoryLots',
  'deliverySlots',
  'pickupSlots',
  'parkingSpots',
  'paymentProviders',
  'customers',
  'orders',
  'coupons',
  'loyaltyPrograms',
];

export function getItemsFromJsonData(jsonData: any, sectionType: SeedSectionKey): string[] {
  if (!jsonData) return [];

  switch (sectionType) {
    case 'departments':
      return (jsonData.departments || []).map((item: any) => item.name || item.handle || 'Department');
    case 'suppliers':
      return (jsonData.suppliers || []).map((item: any) => item.name || item.email || 'Supplier');
    case 'products':
      return (jsonData.products || []).map((item: any) => item.title || item.handle || 'Product');
    case 'inventoryLots':
      return (jsonData.inventoryLots || []).map((item: any) => item.lotNumber || 'Inventory Lot');
    case 'deliverySlots':
      return (jsonData.deliverySlots || []).map((item: any) => item.label || `${item.startTime}-${item.endTime}`);
    case 'pickupSlots':
      return (jsonData.pickupSlots || []).map((item: any) => item.label || `${item.startTime}-${item.endTime}`);
    case 'parkingSpots':
      return (jsonData.parkingSpots || []).map((item: any) => item.spotNumber || 'Parking Spot');
    case 'paymentProviders':
      return (jsonData.paymentProviders || []).map((item: any) => item.name || item.code || 'Payment Provider');
    case 'customers':
      return (jsonData.customers || []).map((item: any) => item.name || item.email || 'Customer');
    case 'orders':
      return (jsonData.orders || []).map((item: any) => `Order #${item.displayId}`);
    case 'coupons':
      return (jsonData.coupons || []).map((item: any) => item.code || 'Coupon');
    case 'loyaltyPrograms':
      return (jsonData.loyaltyPrograms || []).map((item: any) => item.name || 'Loyalty Program');
    default:
      return [];
  }
}

export function getSeedForTemplate(template: TemplateType, seedData: any) {
  const templateToUse: TemplateType = template === 'custom' ? 'minimal' : template;
  const selected = STORE_TEMPLATES[templateToUse].include;

  const filtered = SECTION_KEYS.reduce((acc, key) => {
    const items = seedData[key] || [];
    const allow = new Set(selected[key]);
    acc[key] = items.filter((item: any) => {
      switch (key) {
        case 'departments':
          return allow.has(item.handle);
        case 'suppliers':
          return allow.has(item.email);
        case 'products':
          return allow.has(item.handle);
        case 'inventoryLots':
          return allow.has(item.lotNumber);
        case 'deliverySlots':
        case 'pickupSlots':
          return allow.has(item.label);
        case 'parkingSpots':
          return allow.has(item.spotNumber);
        case 'paymentProviders':
          return allow.has(item.name);
        case 'customers':
          return allow.has(item.email);
        case 'orders':
          return allow.has(String(item.displayId));
        case 'coupons':
          return allow.has(item.code);
        case 'loyaltyPrograms':
          return allow.has(item.name);
        default:
          return false;
      }
    });
    return acc;
  }, {} as Record<SeedSectionKey, any[]>);

  return filtered;
}
