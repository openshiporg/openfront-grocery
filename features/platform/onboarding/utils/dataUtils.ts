import { STORE_TEMPLATES, type SeedSectionKey, type TemplateType } from '../config/templates';

const SECTION_KEYS: SeedSectionKey[] = [
  'storeSettings',
  'departments',
  'suppliers',
  'products',
  'inventoryLots',
  'deliverySlots',
  'pickupSlots',
  'parkingSpots',
  'paymentProviders',
  'coupons',
];

export function getItemsFromJsonData(jsonData: any, sectionType: SeedSectionKey): string[] {
  if (!jsonData) return [];

  switch (sectionType) {
    case 'storeSettings':
      return jsonData.storeSettings ? [jsonData.storeSettings.name || 'Business Profile'] : [];
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
    case 'coupons':
      return (jsonData.coupons || []).map((item: any) => item.code || 'Coupon');
    default:
      return [];
  }
}

export function getSeedForTemplate(template: TemplateType, seedData: any) {
  const templateToUse: TemplateType = template === 'custom' ? 'minimal' : template;
  const selected = STORE_TEMPLATES[templateToUse].include;

  const filtered = SECTION_KEYS.reduce((acc, key) => {
    if (key === 'storeSettings') {
      acc.storeSettings = seedData.storeSettings;
      return acc;
    }

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
        case 'coupons':
          return allow.has(item.code);
        default:
          return false;
      }
    });
    return acc;
  }, {} as Record<SeedSectionKey, any[]>);

  return filtered;
}
