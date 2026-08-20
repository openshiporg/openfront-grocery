import { list } from "@keystone-6/core";
import {
  text,
  integer,
  float,
  timestamp,
  relationship,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';
import { isSignedIn, permissions } from "../access";
import { storeScopedFilter } from '../lib/storeAccess';

export const InventoryLot = list({
  access: {
    operation: {
      query: permissions.canManageInventory,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: { query: storeScopedFilter, update: storeScopedFilter, delete: storeScopedFilter },
  },
  ui: {
    labelField: "lotNumber",
    listView: {
      initialColumns: ["lotNumber", "product", "expirationDate", "quantityRemaining", "supplier"],
    },
  },
  fields: {
    lotNumber: text({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Lot Number",
      ui: {
        description: "Unique identifier for this inventory lot",
      },
    }),
    expirationDate: timestamp({
      validation: { isRequired: true },
      label: "Expiration Date",
      ui: {
        description: "Date when this lot expires",
      },
    }),
    receivedDate: timestamp({
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
      label: "Received Date",
      ui: {
        description: "Date this lot was received",
      },
    }),
    quantity: integer({
      validation: { isRequired: true, min: 0 },
      label: "Original Quantity",
      ui: {
        description: "Total units received in this lot",
      },
    }),
    quantityRemaining: integer({
      validation: { isRequired: true, min: 0 },
      label: "Quantity Remaining",
      ui: {
        description: "Units still available in this lot",
      },
    }),
    costPerUnit: float({
      validation: { isRequired: true },
      label: "Cost Per Unit (legacy display)",
      ui: { description: "Legacy display value; costPerUnitCents is authoritative" },
    }),
    costPerUnitCents: integer({
      defaultValue: 0,
      validation: { isRequired: true, min: 0 },
      access: { create: () => false, update: () => false },
      label: "Cost Per Unit (minor units)",
    }),
    location: text({
      label: "Location",
      ui: {
        description: "Warehouse zone/bin location (e.g., A-1-3)",
      },
    }),
    // Relationships
    store: relationship({
      ref: 'Store.inventoryLots',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false },
    }),
    product: relationship({
      ref: "Product.inventoryLots",
      label: "Product",
    }),
    supplier: relationship({
      ref: "Supplier.inventoryLots",
      label: "Supplier",
    }),
    orderLineAllocations: relationship({
      ref: 'OrderLineInventoryAllocation.inventoryLot',
      many: true,
      access: { update: () => false },
      ui: { itemView: { fieldMode: 'read' } },
    }),
    ...trackingFields,
  },
});
