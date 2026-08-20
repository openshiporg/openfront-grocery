import { list } from "@keystone-6/core";
import {
  text,
  integer,
  float,
  relationship,
  json,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { isSignedIn, permissions } from "../access";
import { relatedStoreScopedFilter } from '../lib/storeAccess';
import { requiredRelationshipPrisma } from './relationshipConfig';

export const OrderLineItem = list({
  access: {
    operation: {
      query: isSignedIn,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: {
      query: async ({ session, context }) => {
        const store = relatedStoreScopedFilter('order')({ session });
        if (store === false) return false;
        if (await permissions.canManageOrders({ session, context })) return store;
        if (session?.itemId) return { AND: [store, { order: { user: { id: { equals: session.itemId } } } }] };
        return false;
      },
      update: relatedStoreScopedFilter('order'),
      delete: relatedStoreScopedFilter('order'),
    },
  },
  ui: {
    listView: {
      initialColumns: ["title", "quantity", "unitPrice", "order"],
    },
  },
  fields: {
    title: text({
      access: { update: () => false },
      validation: { isRequired: true },
      label: "Product Title",
      ui: { itemView: { fieldMode: 'read' } },
    }),
    sku: text({
      access: { update: () => false },
      label: "SKU",
      ui: { itemView: { fieldMode: 'read' } },
    }),
    quantity: integer({
      access: { update: () => false },
      validation: { isRequired: true, min: 1 },
      label: "Quantity",
      ui: { itemView: { fieldMode: 'read' } },
    }),
    unitPrice: float({
      access: { update: () => false },
      validation: { isRequired: true },
      label: "Legacy display unit price",
      ui: { itemView: { fieldMode: 'read' } },
    }),
    unitPriceCents: integer({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: 'Authoritative unit price (minor units)' }),
    thumbnail: text({
      access: { update: () => false },
      label: "Thumbnail URL",
      ui: { itemView: { fieldMode: 'read' } },
    }),
    metadata: json({
      access: { update: () => false },
      ui: { itemView: { fieldMode: 'read' } },
    }),
    // Relationships
    order: relationship({
      access: { update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "Order.lineItems",
      label: "Order",
      ui: { itemView: { fieldMode: 'read' } },
    }),
    product: relationship({
      access: { update: () => false },
      ref: "Product",
      label: "Product",
      ui: { itemView: { fieldMode: 'read' } },
    }),
    // Track which inventory lot was used (for FEFO)
    inventoryLot: relationship({
      access: { update: () => false },
      ref: "InventoryLot",
      label: "Inventory Lot",
      ui: {
        description: "Inventory lot used to fulfill this line item",
        itemView: { fieldMode: 'read' },
      },
    }),
    inventoryAllocations: relationship({
      ref: 'OrderLineInventoryAllocation.lineItem',
      many: true,
      access: { update: () => false },
      ui: { itemView: { fieldMode: 'read' } },
    }),
    substitutions: relationship({
      access: { update: () => false },
      ref: 'OrderItemSubstitution.lineItem',
      many: true,
      label: 'Substitution Evidence',
      ui: { itemView: { fieldMode: 'read' } },
    }),
    ...trackingFields,
  },
});
