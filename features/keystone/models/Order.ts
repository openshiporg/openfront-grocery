import { list } from "@keystone-6/core";
import {
  text,
  select,
  integer,
  float,
  checkbox,
  timestamp,
  relationship,
  json,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';
import { isSignedIn, permissions } from "../access";
import { storeScopedFilter } from '../lib/storeAccess';

function canUpdateUnroutedOrder({ item }: {
  item: { id: { toString(): string }; [key: string]: unknown };
}) {
  return !(item as { deliveryRouteId?: string | null }).deliveryRouteId;
}

function calendarDay(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

export const Order = list({
  access: {
    operation: {
      query: isSignedIn,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: {
      query: async ({ session, context }) => {
        const store = storeScopedFilter({ session });
        if (store === false) return false;
        if (await permissions.canManageOrders({ session, context })) return store;
        if (session?.itemId) return { AND: [store, { user: { id: { equals: session.itemId } } }] };
        return false;
      },
      update: storeScopedFilter,
      delete: storeScopedFilter,
    },
  },
  hooks: {
    validate: {
      update: async ({ item, resolvedData, context, addValidationError }) => {
        const current = item as typeof item & {
          deliveryRouteId?: string | null;
          status?: string | null;
          deliveryDate?: Date | string | null;
          deliveryTimeWindow?: string | null;
          metadata?: Record<string, unknown> | null;
        };
        if (!current.deliveryRouteId) return;

        const route = await context.sudo().query.DeliveryRoute.findOne({
          where: { id: current.deliveryRouteId },
          query: 'id status date timeWindow',
        });
        if (!route) {
          addValidationError('Routed orders must retain their delivery route');
          return;
        }

        const expectedStatus = route.status === 'planning'
          ? 'packed'
          : route.status === 'in_progress'
            ? 'out_for_delivery'
            : 'delivered';
        const nextStatus = resolvedData.status ?? current.status;
        if (nextStatus !== expectedStatus) {
          addValidationError(`Routed order status must remain ${expectedStatus}`);
        }

        const nextDeliveryDate = resolvedData.deliveryDate ?? current.deliveryDate;
        if (calendarDay(nextDeliveryDate as string | Date | null) !== calendarDay(route.date)) {
          addValidationError('Routed order delivery date must match its route');
        }
        const nextTimeWindow = resolvedData.deliveryTimeWindow ?? current.deliveryTimeWindow;
        if (nextTimeWindow !== route.timeWindow) {
          addValidationError('Routed order delivery window must match its route');
        }

        if (resolvedData.metadata !== undefined) {
          const previousMetadata = current.metadata || {};
          const nextMetadata = (resolvedData.metadata || {}) as Record<string, unknown>;
          if (nextMetadata.deliveryRouteId !== current.deliveryRouteId) {
            addValidationError('Routed order metadata must retain its delivery route');
          }
          for (const key of ['routedAt', 'dispatchedAt', 'deliveredAt']) {
            if (previousMetadata[key] && nextMetadata[key] !== previousMetadata[key]) {
              addValidationError(`Routed order metadata must retain ${key}`);
            }
          }
        }
      },
      delete: async ({ item, addValidationError }) => {
        const current = item as typeof item & { deliveryRouteId?: string | null };
        if (current.deliveryRouteId) {
          addValidationError('Routed orders cannot be deleted');
        }
      },
    },
  },
  ui: {
    labelField: "displayId",
    listView: {
      initialColumns: ["displayId", "status", "email", "deliveryDate", "deliveryTimeWindow"],
    },
  },
  fields: {
    displayId: integer({
      isIndexed: 'unique',
      validation: { isRequired: true },
      label: "Order Number",
    }),
    email: text({
      validation: { isRequired: true },
      label: "Customer Email",
    }),
    status: select({
      access: { create: () => false, update: () => false },
      type: "enum",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Picking", value: "picking" },
        { label: "Packed", value: "packed" },
        { label: "Out for Delivery", value: "out_for_delivery" },
        { label: "Delivered", value: "delivered" },
        { label: "Cancelled", value: "cancelled" },
      ],
      defaultValue: "pending",
      validation: { isRequired: true },
      label: "Status",
    }),
    taxRate: float({
      label: "Tax Rate",
    }),
    currencyCode: text({ defaultValue: 'USD', validation: { isRequired: true } }),
    subtotalCents: integer({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    taxCents: integer({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    deliveryFeeCents: integer({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    discountCents: integer({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    totalCents: integer({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    canceledAt: timestamp({
      access: { create: () => false, update: () => false },
      label: "Cancelled At",
    }),
    metadata: json({ access: { create: () => false, update: () => false } }),
    noNotification: checkbox({
      defaultValue: false,
      label: "Suppress Notifications",
    }),

    // Delivery time window fields (grocery-specific)
    deliveryDate: timestamp({
      access: { update: canUpdateUnroutedOrder },
      validation: { isRequired: true },
      label: "Delivery Date",
      ui: {
        description: "Scheduled delivery date",
      },
    }),
    deliveryTimeWindow: select({
      access: { update: canUpdateUnroutedOrder },
      type: "enum",
      options: [
        { label: "8 AM - 10 AM", value: "time_8_10" },
        { label: "10 AM - 12 PM", value: "time_10_12" },
        { label: "12 PM - 2 PM", value: "time_12_14" },
        { label: "2 PM - 4 PM", value: "time_14_16" },
        { label: "4 PM - 6 PM", value: "time_16_18" },
        { label: "6 PM - 8 PM", value: "time_18_20" },
      ],
      validation: { isRequired: true },
      label: "Delivery Time Window",
      ui: {
        description: "Customer's selected delivery time slot",
      },
    }),
    deliveryInstructions: text({
      ui: {
        displayMode: "textarea",
        description: "Special delivery instructions from customer",
      },
      label: "Delivery Instructions",
    }),
    substitutionPreference: select({
      type: "enum",
      options: [
        { label: "Call Me", value: "call_me" },
        { label: "Best Match", value: "best_match" },
        { label: "Refund", value: "refund" },
      ],
      defaultValue: "best_match",
      label: "Substitution Preference",
      ui: {
        description: "What to do if an item is out of stock",
      },
    }),

    // Relationships
    store: relationship({
      ref: 'Store.orders',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false },
    }),
    user: relationship({
      ref: "User",
      label: "Customer",
    }),
    shippingAddress: relationship({
      ref: "Address",
      label: "Shipping Address",
    }),
    billingAddress: relationship({
      ref: "Address",
      label: "Billing Address",
    }),
    checkoutAttempts: relationship({ ref: 'CheckoutAttempt.order', many: true, access: { update: () => false }, ui: { itemView: { fieldMode: 'read' } } }),
    payments: relationship({
      ref: 'Payment.order',
      many: true,
      access: { update: () => false },
      ui: { itemView: { fieldMode: 'read' } },
    }),
    lineItems: relationship({
      ref: "OrderLineItem.order",
      many: true,
      label: "Line Items",
    }),
    deliverySlot: relationship({ ref: 'DeliverySlot.orders', access: { update: () => false } }),
    pickupSlot: relationship({ ref: 'PickupSlot.orders', access: { update: () => false } }),
    deliveryRoute: relationship({
      access: { update: () => false },
      ref: "DeliveryRoute.orders",
      label: "Delivery Route",
    }),
    ...trackingFields,
  },
});
