import {
  Boxes,
  ClipboardList,
  PackageCheck,
  Truck,
  Store,
  Warehouse,
  Factory,
  Users,
  Repeat,
  BadgePercent,
  type LucideIcon,
} from 'lucide-react';

export interface GroceryPlatformNavItem {
  title: string;
  href: string;
  description: string;
  icon: LucideIcon;
  group: 'operations' | 'catalog' | 'customers';
}

export const groceryPlatformNavItems: GroceryPlatformNavItem[] = [
  {
    title: 'Orders',
    href: '/dashboard/platform/orders',
    description: 'Monitor incoming grocery orders and move them through fulfillment.',
    icon: ClipboardList,
    group: 'operations',
  },
  {
    title: 'Fulfillment',
    href: '/dashboard/platform/fulfillment',
    description: 'Use the order queue as the starting point for picking and packing.',
    icon: PackageCheck,
    group: 'operations',
  },
  {
    title: 'Delivery',
    href: '/dashboard/platform/delivery',
    description: 'Manage delivery routes, timing, and dispatch operations.',
    icon: Truck,
    group: 'operations',
  },
  {
    title: 'Pickup',
    href: '/dashboard/platform/pickup',
    description: 'Track curbside pickup slots and handoff readiness.',
    icon: Store,
    group: 'operations',
  },
  {
    title: 'Inventory',
    href: '/dashboard/platform/inventory',
    description: 'Watch lot-level stock, expiry risk, and replenishment needs.',
    icon: Warehouse,
    group: 'catalog',
  },
  {
    title: 'Suppliers',
    href: '/dashboard/platform/suppliers',
    description: 'Review suppliers, delivery days, and purchasing relationships.',
    icon: Factory,
    group: 'catalog',
  },
  {
    title: 'Purchasing',
    href: '/dashboard/platform/purchasing',
    description: 'Inspect purchase orders, receiving, and replenishment flow.',
    icon: Boxes,
    group: 'catalog',
  },
  {
    title: 'Customers',
    href: '/dashboard/platform/customers',
    description: 'Inspect customer accounts, orders, and grocery lifecycle activity.',
    icon: Users,
    group: 'customers',
  },
  {
    title: 'Subscriptions',
    href: '/dashboard/platform/subscriptions',
    description: 'Manage recurring grocery orders and repeat purchase schedules.',
    icon: Repeat,
    group: 'customers',
  },
  {
    title: 'Merchandising',
    href: '/dashboard/platform/merchandising',
    description: 'Manage offers, coupons, and promotional grocery merchandising.',
    icon: BadgePercent,
    group: 'catalog',
  },
];

export const groceryPlatformNavGroups = [
  {
    id: 'operations',
    title: 'Operations',
    icon: ClipboardList,
  },
  {
    id: 'catalog',
    title: 'Catalog & Supply',
    icon: Boxes,
  },
  {
    id: 'customers',
    title: 'Customers & Retention',
    icon: Users,
  },
] as const;
