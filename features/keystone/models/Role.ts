import { list } from "@keystone-6/core";
import {
  text,
  checkbox,
  relationship,
} from "@keystone-6/core/fields";
import { storeScopedFilter } from '../lib/storeAccess';
import { getPublicStoreId } from '../lib/runtimeConfig';
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';

export const Role = list({
  access: {
    // Role administration is domain-owned. Generic CRUD must not trust
    // capability claims cached in a stateless session after revocation.
    operation: { query: ({ session }) => Boolean(session?.itemId), create: () => false, update: () => false, delete: () => false },
    filter: {
      query: ({ session }) => session?.itemId ? { assignedTo: { some: { id: { equals: session.itemId } } } } : false,
      update: storeScopedFilter,
      delete: storeScopedFilter,
    },
  },
  hooks: {
    resolveInput: {
      create: async ({ resolvedData, context }) => {
        if (!context.session?.itemId) {
          const userCount = await context.prisma.user.count();
          const bootstrapStore = userCount === 0
            ? await context.prisma.store.findUnique({ where: { id: getPublicStoreId() }, select: { id: true, isActive: true } })
            : null;
          if (!bootstrapStore?.isActive) throw new Error('Active store scope is required');
          return { ...resolvedData, store: { connect: { id: bootstrapStore.id } } };
        }
        const user = await context.prisma.user.findUnique({
          where: { id: context.session.itemId },
          select: { store: { select: { id: true, isActive: true } } },
        });
        if (!user?.store?.isActive) throw new Error('Active store scope is required');
        return { ...resolvedData, store: { connect: { id: user.store.id } } };
      },
    },
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "canManageProducts", "canManageOrders", "canManageInventory", "canManageOnboarding", "canAccessDashboard"],
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
      label: "Role Name",
    }),
    // Permission flags
    canManageProducts: checkbox({
      defaultValue: false,
      label: "Can Manage Products",
    }),
    canManageOrders: checkbox({
      defaultValue: false,
      label: "Can Manage Orders",
    }),
    canManagePayments: checkbox({
      defaultValue: false,
      label: 'Can Manage Payments',
    }),
    canManageInventory: checkbox({
      defaultValue: false,
      label: "Can Manage Inventory",
    }),
    canManageSuppliers: checkbox({
      defaultValue: false,
      label: "Can Manage Suppliers",
    }),
    canManageDelivery: checkbox({
      defaultValue: false,
      label: "Can Manage Delivery Routes",
    }),
    canManageUsers: checkbox({
      defaultValue: false,
      label: "Can Manage Users",
    }),
    canManageOnboarding: checkbox({
      defaultValue: false,
      label: "Can Manage Onboarding",
    }),
    canAccessDashboard: checkbox({
      defaultValue: false,
      label: "Can Access Dashboard",
    }),
    // Relationships
    store: relationship({
      ref: 'Store.roles',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false },
    }),
    assignedTo: relationship({
      ref: "User.role",
      many: true,
      access: { update: () => false },
      label: "Assigned To",
    }),
    ...trackingFields,
  },
});
