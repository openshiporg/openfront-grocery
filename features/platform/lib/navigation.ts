import {
  BadgePercent,
  Boxes,
  ClipboardList,
  Factory,
  PackageCheck,
  Repeat,
  Store,
  Truck,
  type LucideIcon,
  Users,
  Warehouse,
} from 'lucide-react';

export type GroceryPlatformNavGroupId = 'standalone' | 'catalog' | 'customers';

export interface GroceryPlatformNavItem {
  title: string;
  href: string;
  description: string;
  icon: LucideIcon;
  group: GroceryPlatformNavGroupId;
}

export interface GroceryPlatformNavGroup {
  id: Exclude<GroceryPlatformNavGroupId, 'standalone'>;
  title: string;
  icon: LucideIcon;
  items: GroceryPlatformNavItem[];
}

export const groceryPlatformNavItems: GroceryPlatformNavItem[] = [
  {
    title: 'Orders',
    href: '/platform/orders',
    description: 'Monitor incoming grocery orders and move them through fulfillment.',
    icon: ClipboardList,
    group: 'standalone',
  },
  {
    title: 'Fulfillment',
    href: '/platform/fulfillment',
    description: 'Run the pick, pack, and substitution workflow for active orders.',
    icon: PackageCheck,
    group: 'standalone',
  },
  {
    title: 'Delivery',
    href: '/platform/delivery',
    description: 'Manage delivery routes, timing, and dispatch operations.',
    icon: Truck,
    group: 'standalone',
  },
  {
    title: 'Pickup',
    href: '/platform/pickup',
    description: 'Track curbside pickup slots and handoff readiness.',
    icon: Store,
    group: 'standalone',
  },
  {
    title: 'Inventory',
    href: '/platform/inventory',
    description: 'Watch lot-level stock, expiry risk, and replenishment needs.',
    icon: Warehouse,
    group: 'catalog',
  },
  {
    title: 'Suppliers',
    href: '/platform/suppliers',
    description: 'Review suppliers, delivery days, and purchasing relationships.',
    icon: Factory,
    group: 'catalog',
  },
  {
    title: 'Purchasing',
    href: '/platform/purchasing',
    description: 'Inspect purchase orders, receiving, and replenishment flow.',
    icon: Boxes,
    group: 'catalog',
  },
  {
    title: 'Merchandising',
    href: '/platform/merchandising',
    description: 'Manage offers, coupons, and promotional grocery merchandising.',
    icon: BadgePercent,
    group: 'catalog',
  },
  {
    title: 'Customers',
    href: '/platform/customers',
    description: 'Inspect customer accounts, orders, and grocery lifecycle activity.',
    icon: Users,
    group: 'customers',
  },
  {
    title: 'Subscriptions',
    href: '/platform/subscriptions',
    description: 'Manage recurring grocery orders and repeat purchase schedules.',
    icon: Repeat,
    group: 'customers',
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

export function getPlatformNavItemsWithBasePath(basePath: string) {
  return groceryPlatformNavItems.map((item) => ({ ...item, href: `${basePath}${item.href}` }));
}
