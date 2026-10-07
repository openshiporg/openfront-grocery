import {
  BadgePercent,
  Boxes,
  ClipboardList,
  CreditCard,
  Factory,
  PackageCheck,
  Settings2,
  Store,
  Truck,
  type LucideIcon,
  Users,
  Warehouse,
} from 'lucide-react';

export type GroceryPlatformNavGroupId = 'standalone' | 'catalog' | 'customers';
export type GroceryPlatformCapability =
  | 'canManageProducts'
  | 'canManageOrders'
  | 'canManageInventory'
  | 'canManageSuppliers'
  | 'canManageDelivery'
  | 'canManageUsers'
  | 'canManagePayments'
  | 'canManageOnboarding';
export type GroceryPlatformCapabilities = Partial<Record<GroceryPlatformCapability, boolean>>;

export interface GroceryPlatformNavItem {
  title: string;
  href: string;
  description: string;
  icon: LucideIcon;
  group: GroceryPlatformNavGroupId;
  capability: GroceryPlatformCapability;
}

export interface GroceryPlatformNavGroup {
  id: Exclude<GroceryPlatformNavGroupId, 'standalone'>;
  title: string;
  icon: LucideIcon;
  items: GroceryPlatformNavItem[];
}

export const groceryPlatformNavItems: GroceryPlatformNavItem[] = [
  {title:'Staff & privacy',href:'/platform/staff',description:'Invite staff, review capabilities and customer privacy requests.',icon:Users,group:'customers',capability:'canManageUsers'},
  {title:'Communications',href:'/platform/communications',description:'Inspect customer messages and event retries.',icon:ClipboardList,group:'standalone',capability:'canManageOnboarding'},
  { title: 'Reports', href: '/platform/reports', description: 'Close trading periods and reconcile supplier and payment statements.', icon: ClipboardList, group: 'standalone', capability: 'canManagePayments' },
  { title: 'Recurring baskets & rewards', href: '/platform/subscriptions', description: 'Prepare scheduled baskets and manage rewards.', icon: BadgePercent, group: 'customers', capability: 'canManageOrders' },
  {
    title: 'Orders',
    href: '/platform/orders',
    description: 'Monitor incoming grocery orders and move them through fulfillment.',
    icon: ClipboardList,
    group: 'standalone',
    capability: 'canManageOrders',
  },
  {
    title: 'Fulfillment',
    href: '/platform/fulfillment',
    description: 'Run the pick, pack, and substitution workflow for active orders.',
    icon: PackageCheck,
    group: 'standalone',
    capability: 'canManageOrders',
  },
  {
    title: 'Delivery',
    href: '/platform/delivery',
    description: 'Manage delivery routes, timing, and dispatch operations.',
    icon: Truck,
    group: 'standalone',
    capability: 'canManageDelivery',
  },
  {
    title: 'Pickup',
    href: '/platform/pickup',
    description: 'Track curbside pickup slots and handoff readiness.',
    icon: Store,
    group: 'standalone',
    capability: 'canManageDelivery',
  },
  {
    title: 'Payments',
    href: '/platform/payments',
    description: 'Review provider truth, captured money, refunds, and recovery attention.',
    icon: CreditCard,
    group: 'standalone',
    capability: 'canManagePayments',
  },
  {
    title: 'Settings',
    href: '/platform/settings',
    description: 'Read Store policy, branding, tax, and fulfillment configuration.',
    icon: Settings2,
    group: 'standalone',
    capability: 'canManageOnboarding',
  },
  {
    title: 'Inventory',
    href: '/platform/inventory',
    description: 'Review page-scoped lot-level stock, expiry risk, and low-stock signals.',
    icon: Warehouse,
    group: 'catalog',
    capability: 'canManageInventory',
  },
  {
    title: 'Suppliers',
    href: '/platform/suppliers',
    description: 'Review suppliers, delivery days, and purchasing relationships.',
    icon: Factory,
    group: 'catalog',
    capability: 'canManageSuppliers',
  },
  {
    title: 'Purchasing',
    href: '/platform/purchasing',
    description: 'Manage operator-created purchase orders and receiving; no reorder recommendation is provided.',
    icon: Boxes,
    group: 'catalog',
    capability: 'canManageInventory',
  },
  {
    title: 'Merchandising',
    href: '/platform/merchandising',
    description: 'Manage offers, coupons, and promotional grocery merchandising.',
    icon: BadgePercent,
    group: 'catalog',
    capability: 'canManageProducts',
  },
  {
    title: 'Customers',
    href: '/platform/customers',
    description: 'Inspect customer accounts, orders, and grocery lifecycle activity.',
    icon: Users,
    group: 'customers',
    capability: 'canManageUsers',
  },
];

export const platformStandaloneItems = groceryPlatformNavItems.filter(
  (item) => item.group === 'standalone'
);

export const groceryPlatformNavGroups: GroceryPlatformNavGroup[] = [
  {
    id: 'catalog',
    title: 'Catalog & Supply',
    icon: Boxes,
    items: groceryPlatformNavItems.filter((item) => item.group === 'catalog'),
  },
  {
    id: 'customers',
    title: 'Customers & Retention',
    icon: Users,
    items: groceryPlatformNavItems.filter((item) => item.group === 'customers'),
  },
];

export const platformNavItems = groceryPlatformNavItems;
export const platformNavGroups = groceryPlatformNavGroups;

export function getPlatformNavItemsForCapabilities(capabilities?: GroceryPlatformCapabilities | null) {
  if (!capabilities) return [];
  return groceryPlatformNavItems.filter((item) => capabilities[item.capability] === true);
}

export function getPlatformNavItemsWithBasePath(basePath: string, capabilities?: GroceryPlatformCapabilities | null) {
  return getPlatformNavItemsForCapabilities(capabilities).map((item) => ({ ...item, href: `${basePath}${item.href}` }));
}
