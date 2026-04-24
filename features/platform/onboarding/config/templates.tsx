import { Building2, Package, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';

export type TemplateType = 'full' | 'minimal' | 'custom';

export type SeedSectionKey =
  | 'departments'
  | 'suppliers'
  | 'products'
  | 'inventoryLots'
  | 'deliverySlots'
  | 'pickupSlots'
  | 'parkingSpots'
  | 'paymentProviders'
  | 'customers'
  | 'orders'
  | 'coupons'
  | 'loyaltyPrograms';

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
      'Seed a believable grocery demo with departments, suppliers, products, live slots, a customer profile, orders, coupons, and loyalty data.',
    icon: <Building2 className="h-5 w-5" />,
    include: {
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
      paymentProviders: ['Stripe Checkout', 'Manual Demo'],
      customers: ['alex.shopper@example.com'],
      orders: ['1001', '1002'],
      coupons: ['WELCOME10', 'FRESH5'],
      loyaltyPrograms: ['Fresh Rewards'],
    },
    displayNames: {
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
      paymentProviders: ['Stripe Checkout', 'Manual Demo'],
      customers: ['Alex Shopper'],
      orders: ['Order #1001', 'Order #1002'],
      coupons: ['WELCOME10', 'FRESH5'],
      loyaltyPrograms: ['Fresh Rewards'],
    },
  },
  minimal: {
    name: 'Basic Setup',
    description:
      'Seed just enough grocery data to browse products, test slots, and inspect one customer and one order.',
    icon: <Package className="h-5 w-5" />,
    include: {
      departments: ['produce', 'dairy', 'pantry'],
      suppliers: ['local-harvest@example.com', 'bay-dairy@example.com'],
      products: ['organic-bananas', 'whole-milk-gallon', 'jasmine-rice', 'sourdough-bread'],
      inventoryLots: ['LOT-BAN-001', 'LOT-MILK-001', 'LOT-RICE-001', 'LOT-BREAD-001'],
      deliverySlots: ['AM Rush', 'After Work'],
      pickupSlots: ['Curbside 11AM', 'Curbside 4PM'],
      parkingSpots: ['A1', 'ADA-1'],
      paymentProviders: ['Stripe Checkout', 'Manual Demo'],
      customers: ['alex.shopper@example.com'],
      orders: ['1001'],
      coupons: ['WELCOME10'],
      loyaltyPrograms: ['Fresh Rewards'],
    },
    displayNames: {
      departments: ['Produce', 'Dairy & Eggs', 'Pantry'],
      suppliers: ['Local Harvest Co-op', 'Bay Dairy'],
      products: ['Organic Bananas', 'Whole Milk', 'Jasmine Rice', 'Sourdough Bread'],
      inventoryLots: ['LOT-BAN-001', 'LOT-MILK-001', 'LOT-RICE-001', 'LOT-BREAD-001'],
      deliverySlots: ['AM Rush', 'After Work'],
      pickupSlots: ['Curbside 11AM', 'Curbside 4PM'],
      parkingSpots: ['A1', 'ADA-1'],
      paymentProviders: ['Stripe Checkout', 'Manual Demo'],
      customers: ['Alex Shopper'],
      orders: ['Order #1001'],
      coupons: ['WELCOME10'],
      loyaltyPrograms: ['Fresh Rewards'],
    },
  },
  custom: {
    name: 'Custom Setup',
    description:
      'Start from the minimal grocery JSON and customize the exact seed data you want to create.',
    icon: <SlidersHorizontal className="h-5 w-5" />,
    include: {
      departments: ['produce', 'dairy', 'pantry'],
      suppliers: ['local-harvest@example.com', 'bay-dairy@example.com'],
      products: ['organic-bananas', 'whole-milk-gallon', 'jasmine-rice', 'sourdough-bread'],
      inventoryLots: ['LOT-BAN-001', 'LOT-MILK-001', 'LOT-RICE-001', 'LOT-BREAD-001'],
      deliverySlots: ['AM Rush', 'After Work'],
      pickupSlots: ['Curbside 11AM', 'Curbside 4PM'],
      parkingSpots: ['A1', 'ADA-1'],
      paymentProviders: ['Stripe Checkout', 'Manual Demo'],
      customers: ['alex.shopper@example.com'],
      orders: ['1001'],
      coupons: ['WELCOME10'],
      loyaltyPrograms: ['Fresh Rewards'],
    },
    displayNames: {
      departments: ['Produce', 'Dairy & Eggs', 'Pantry'],
      suppliers: ['Local Harvest Co-op', 'Bay Dairy'],
      products: ['Organic Bananas', 'Whole Milk', 'Jasmine Rice', 'Sourdough Bread'],
      inventoryLots: ['LOT-BAN-001', 'LOT-MILK-001', 'LOT-RICE-001', 'LOT-BREAD-001'],
      deliverySlots: ['AM Rush', 'After Work'],
      pickupSlots: ['Curbside 11AM', 'Curbside 4PM'],
      parkingSpots: ['A1', 'ADA-1'],
      paymentProviders: ['Stripe Checkout', 'Manual Demo'],
      customers: ['Alex Shopper'],
      orders: ['Order #1001'],
      coupons: ['WELCOME10'],
      loyaltyPrograms: ['Fresh Rewards'],
    },
  },
};

export const SECTION_DEFINITIONS: SectionDefinition[] = [
  { id: 1, type: 'departments', label: 'Departments', jsonKey: 'departments' },
  { id: 2, type: 'suppliers', label: 'Suppliers', jsonKey: 'suppliers' },
  { id: 3, type: 'products', label: 'Products', jsonKey: 'products' },
  { id: 4, type: 'inventoryLots', label: 'Inventory Lots', jsonKey: 'inventoryLots' },
  { id: 5, type: 'deliverySlots', label: 'Delivery Slots', jsonKey: 'deliverySlots' },
  { id: 6, type: 'pickupSlots', label: 'Pickup Slots', jsonKey: 'pickupSlots' },
  { id: 7, type: 'parkingSpots', label: 'Curbside Parking', jsonKey: 'parkingSpots' },
  { id: 8, type: 'paymentProviders', label: 'Payment Providers', jsonKey: 'paymentProviders' },
  { id: 9, type: 'customers', label: 'Customers & Preferences', jsonKey: 'customers' },
  { id: 10, type: 'orders', label: 'Sample Orders', jsonKey: 'orders' },
  { id: 11, type: 'coupons', label: 'Coupons', jsonKey: 'coupons' },
  { id: 12, type: 'loyaltyPrograms', label: 'Loyalty Programs', jsonKey: 'loyaltyPrograms' },
];
