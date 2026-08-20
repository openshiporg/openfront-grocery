import { Building2, Package, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';

export type TemplateType = 'full' | 'minimal' | 'custom';

export type SeedSectionKey =
  | 'storeSettings'
  | 'departments'
  | 'suppliers'
  | 'products'
  | 'inventoryLots'
  | 'deliverySlots'
  | 'pickupSlots'
  | 'parkingSpots'
  | 'paymentProviders'
  | 'coupons';

export interface StoreTemplate {
  name: string;
  description: string;
  icon: ReactNode;
  include: Record<SeedSectionKey, string[]>;
  displayNames: Record<SeedSectionKey, string[]>;
}

export interface SectionDefinition {
  id: number;
  type: SeedSectionKey;
  label: string;
  jsonKey: SeedSectionKey;
}

export const STORE_TEMPLATES: Record<TemplateType, StoreTemplate> = {
  full: {
    name: 'Complete Setup',
    description:
      'Initialize the Store profile, catalog, suppliers, full-count inventory, rolling Store-local fulfillment policy, dated slot capacity, parking, coupons, and static payment adapters.',
    icon: <Building2 className="h-5 w-5" />,
    include: {
      storeSettings: ['Juniper Market'],
      departments: ['produce', 'dairy', 'meat-seafood', 'bakery', 'frozen', 'pantry'],
      suppliers: ['local-harvest@example.com', 'bay-dairy@example.com', 'ocean-catch@example.com'],
      products: [
        'organic-bananas',
        'avocados-hass',
        'whole-milk-gallon',
        'greek-yogurt-plain',
        'fresh-salmon-fillet',
        'sourdough-bread',
        'frozen-blueberries',
        'jasmine-rice',
      ],
      inventoryLots: [
        'LOT-BAN-001',
        'LOT-AVO-001',
        'LOT-MILK-001',
        'LOT-YOG-001',
        'LOT-SALMON-001',
        'LOT-BREAD-001',
        'LOT-BLUE-001',
        'LOT-RICE-001',
      ],
      deliverySlots: ['AM Rush', 'Late Morning', 'Early Afternoon', 'After Work', 'Evening'],
      pickupSlots: ['Curbside 9AM', 'Curbside 11AM', 'Curbside 1PM', 'Curbside 4PM', 'Curbside 6PM'],
      parkingSpots: ['A1', 'A2', 'B1', 'ADA-1'],
      paymentProviders: ['Stripe Checkout'],
      coupons: ['WELCOME10', 'FRESH5'],
    },
    displayNames: {
      storeSettings: ['Juniper Market'],
      departments: ['Produce', 'Dairy & Eggs', 'Meat & Seafood', 'Bakery', 'Frozen', 'Pantry'],
      suppliers: ['Local Harvest Co-op', 'Bay Dairy', 'Ocean Catch Seafood'],
      products: [
        'Organic Bananas',
        'Hass Avocados',
        'Whole Milk',
        'Plain Greek Yogurt',
        'Fresh Salmon Fillet',
        'Sourdough Bread',
        'Frozen Blueberries',
        'Jasmine Rice',
      ],
      inventoryLots: [
        'LOT-BAN-001',
        'LOT-AVO-001',
        'LOT-MILK-001',
        'LOT-YOG-001',
        'LOT-SALMON-001',
        'LOT-BREAD-001',
        'LOT-BLUE-001',
        'LOT-RICE-001',
      ],
      deliverySlots: ['AM Rush', 'Late Morning', 'Early Afternoon', 'After Work', 'Evening'],
      pickupSlots: ['Curbside 9AM', 'Curbside 11AM', 'Curbside 1PM', 'Curbside 4PM', 'Curbside 6PM'],
      parkingSpots: ['A1', 'A2', 'B1', 'ADA-1'],
      paymentProviders: ['Stripe Checkout'],
      coupons: ['WELCOME10', 'FRESH5'],
    },
  },
  minimal: {
    name: 'Basic Setup',
    description:
      'Initialize a smaller connected catalog, supplier, inventory, slot, parking, coupon, and adapter baseline.',
    icon: <Package className="h-5 w-5" />,
    include: {
      storeSettings: ['Juniper Market'],
      departments: ['produce', 'dairy', 'pantry'],
      suppliers: ['local-harvest@example.com', 'bay-dairy@example.com'],
      products: ['organic-bananas', 'whole-milk-gallon', 'jasmine-rice', 'sourdough-bread'],
      inventoryLots: ['LOT-BAN-001', 'LOT-MILK-001', 'LOT-RICE-001', 'LOT-BREAD-001'],
      deliverySlots: ['AM Rush', 'After Work'],
      pickupSlots: ['Curbside 11AM', 'Curbside 4PM'],
      parkingSpots: ['A1', 'ADA-1'],
      paymentProviders: ['Stripe Checkout'],
      coupons: ['WELCOME10'],
    },
    displayNames: {
      storeSettings: ['Juniper Market'],
      departments: ['Produce', 'Dairy & Eggs', 'Pantry'],
      suppliers: ['Local Harvest Co-op', 'Bay Dairy'],
      products: ['Organic Bananas', 'Whole Milk', 'Jasmine Rice', 'Sourdough Bread'],
      inventoryLots: ['LOT-BAN-001', 'LOT-MILK-001', 'LOT-RICE-001', 'LOT-BREAD-001'],
      deliverySlots: ['AM Rush', 'After Work'],
      pickupSlots: ['Curbside 11AM', 'Curbside 4PM'],
      parkingSpots: ['A1', 'ADA-1'],
      paymentProviders: ['Stripe Checkout'],
      coupons: ['WELCOME10'],
    },
  },
  custom: {
    name: 'Custom Setup',
    description:
      'Start from the smaller launch JSON and customize real Store-owned baseline data before initialization.',
    icon: <SlidersHorizontal className="h-5 w-5" />,
    include: {
      storeSettings: ['Juniper Market'],
      departments: ['produce', 'dairy', 'pantry'],
      suppliers: ['local-harvest@example.com', 'bay-dairy@example.com'],
      products: ['organic-bananas', 'whole-milk-gallon', 'jasmine-rice', 'sourdough-bread'],
      inventoryLots: ['LOT-BAN-001', 'LOT-MILK-001', 'LOT-RICE-001', 'LOT-BREAD-001'],
      deliverySlots: ['AM Rush', 'After Work'],
      pickupSlots: ['Curbside 11AM', 'Curbside 4PM'],
      parkingSpots: ['A1', 'ADA-1'],
      paymentProviders: ['Stripe Checkout'],
      coupons: ['WELCOME10'],
    },
    displayNames: {
      storeSettings: ['Juniper Market'],
      departments: ['Produce', 'Dairy & Eggs', 'Pantry'],
      suppliers: ['Local Harvest Co-op', 'Bay Dairy'],
      products: ['Organic Bananas', 'Whole Milk', 'Jasmine Rice', 'Sourdough Bread'],
      inventoryLots: ['LOT-BAN-001', 'LOT-MILK-001', 'LOT-RICE-001', 'LOT-BREAD-001'],
      deliverySlots: ['AM Rush', 'After Work'],
      pickupSlots: ['Curbside 11AM', 'Curbside 4PM'],
      parkingSpots: ['A1', 'ADA-1'],
      paymentProviders: ['Stripe Checkout'],
      coupons: ['WELCOME10'],
    },
  },
};

export const SECTION_DEFINITIONS: SectionDefinition[] = [
  { id: 1, type: 'storeSettings', label: 'Business Profile', jsonKey: 'storeSettings' },
  { id: 2, type: 'departments', label: 'Departments', jsonKey: 'departments' },
  { id: 3, type: 'suppliers', label: 'Suppliers', jsonKey: 'suppliers' },
  { id: 4, type: 'products', label: 'Products', jsonKey: 'products' },
  { id: 5, type: 'inventoryLots', label: 'Inventory Lots', jsonKey: 'inventoryLots' },
  { id: 6, type: 'deliverySlots', label: 'Delivery Slots', jsonKey: 'deliverySlots' },
  { id: 7, type: 'pickupSlots', label: 'Pickup Slots', jsonKey: 'pickupSlots' },
  { id: 8, type: 'parkingSpots', label: 'Curbside Parking', jsonKey: 'parkingSpots' },
  { id: 9, type: 'paymentProviders', label: 'Payment Providers', jsonKey: 'paymentProviders' },
  { id: 10, type: 'coupons', label: 'Coupons', jsonKey: 'coupons' },
];
