import { list } from "@keystone-6/core";
import {
  integer,
  checkbox,
  timestamp,
  text,
  relationship,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';
import { isSignedIn, permissions } from "../access";
import { storeScopedFilter } from '../lib/storeAccess';

export const PickupSlot = list({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageDelivery,
      update: permissions.canManageDelivery,
      delete: permissions.canManageDelivery,
    },
    filter: {
      query: storeScopedFilter,
      update: storeScopedFilter,
      delete: storeScopedFilter,
    },
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.data.store?.id) return resolvedData;
      return { ...resolvedData, store: { connect: { id: context.session.data.store.id } } };
    },
    validate: { delete: async ({ item, addValidationError }) => { if (Number(item.currentOrders || 0) > 0) addValidationError('Booked pickup slots cannot be deleted'); } },
  },
  ui: {
    listView: {
      initialColumns: ["date", "startTime", "endTime", "maxOrders", "currentOrders", "isAvailable"],
    },
  },
  fields: {
    store: relationship({
      ref: 'Store.pickupSlots',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageDelivery, update: () => false },
    }),
    orders: relationship({ ref: 'Order.pickupSlot', many: true, access: { update: () => false } }),
    date: timestamp({
      validation: { isRequired: true },
      label: "Date",
      ui: {
        description: "Date for this pickup slot",
      },
    }),
    startTime: text({
      validation: { isRequired: true },
      label: "Start Time",
      ui: {
        description: "Start time for this slot (e.g., '09:00')",
      },
    }),
    endTime: text({
      validation: { isRequired: true },
      label: "End Time",
      ui: {
        description: "End time for this slot (e.g., '10:00')",
      },
    }),
    maxOrders: integer({
      access: { update: () => false },
      validation: { isRequired: true },
      defaultValue: 10,
      label: "Max Orders",
      ui: {
        description: "Maximum number of orders that can be scheduled for this slot",
      },
    }),
    currentOrders: integer({
      access: { create: () => false, update: () => false },
      defaultValue: 0,
      label: "Current Orders",
      ui: {
        description: "Current number of orders scheduled for this slot",
      },
    }),
    isActive: checkbox({
      access: { update: () => false },
      defaultValue: true,
      label: 'Operationally active',
      ui: { description: 'Operator-owned slot state; capacity changes never reopen a closed slot' },
    }),
    isAvailable: checkbox({
      access: { update: () => false },
      defaultValue: true,
      label: "Has capacity",
      ui: {
        description: "Derived from operational state and remaining capacity",
      },
    }),
    ...trackingFields,
  },
});
