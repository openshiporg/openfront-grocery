import { list } from "@keystone-6/core";
import {
  text,
  select,
  integer,
  checkbox,
  float,
  timestamp,
  relationship,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';
import { isSignedIn, permissions, type Session } from "../access";
import { ownerStoreScopedFilter } from '../lib/storeAccess';

async function subscriptionAccessFilter({ session, context }: { session?: Session; context?: { prisma?: any } }) {
  const store = ownerStoreScopedFilter('user')({ session });
  if (store === false) return false;
  if (await permissions.canManageOrders({ session, context })) return store;
  return session?.itemId
    ? { AND: [store, { user: { id: { equals: session.itemId } } }] }
    : false;
}

export const Subscription = list({
  access: {
    operation: {
      query: isSignedIn,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: {
      query: subscriptionAccessFilter,
      update: subscriptionAccessFilter,
      delete: subscriptionAccessFilter,
    },
  },
  ui: {
    labelField: "product",
    listView: {
      initialColumns: ["user", "product", "frequency", "nextDeliveryDate", "isActive"],
    },
  },
  fields: {
    // User who owns the subscription
    user: relationship({
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false },
      ref: "User",
      label: "User",
      ui: {
        description: "The user who owns this subscription",
      },
    }),
    // Product ID (text field)
    product: text({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Product Snapshot",
      ui: {
        description: "Legacy product handle snapshot",
      },
    }),
    productRef: relationship({
      ref: 'Product.subscriptions',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false },
      label: 'Product',
    }),
    // Quantity to deliver each time
    quantity: integer({
      validation: { isRequired: true, min: 1 },
      defaultValue: 1,
      label: "Quantity",
      ui: {
        description: "Number of items to deliver each time",
      },
    }),
    // Delivery frequency
    frequency: select({
      type: "enum",
      options: [
        { label: "Weekly", value: "weekly" },
        { label: "Biweekly", value: "biweekly" },
        { label: "Monthly", value: "monthly" },
      ],
      defaultValue: "weekly",
      validation: { isRequired: true },
      label: "Frequency",
      ui: {
        description: "How often to deliver this subscription",
      },
    }),
    // Next scheduled delivery date
    nextDeliveryDate: timestamp({
      label: "Next Delivery Date",
      ui: {
        description: "Date of the next scheduled delivery",
      },
    }),
    // Subscription discount percentage
    discount: float({
      label: "Discount percentage (legacy display)",
      ui: { description: "Legacy display value; discountBps is authoritative" },
      validation: { min: 0, max: 100 },
      defaultValue: 0,
    }),
    discountBps: integer({
      defaultValue: 0,
      validation: { isRequired: true, min: 0, max: 10000 },
      access: { create: () => false, update: () => false },
      label: "Discount (basis points)",
    }),
    // Whether subscription is currently active
    isActive: checkbox({
      defaultValue: true,
      label: "Is Active",
      ui: {
        description: "Whether this subscription is currently active",
      },
    }),
    // Paused until date (for temporary pauses)
    pausedUntil: timestamp({
      label: "Paused Until",
      ui: {
        description: "If set, subscription is paused until this date",
      },
    }),
    ...trackingFields,
  },
});
