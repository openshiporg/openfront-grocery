import { list } from "@keystone-6/core";
import {
  text,
  integer,
  float,
  timestamp,
  relationship,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { isSignedIn, permissions } from "../access";

export const InventoryLot = list({
  access: {
    operation: {
      query: permissions.canManageInventory,
      create: permissions.canManageInventory,
      update: permissions.canManageInventory,
      delete: permissions.canManageInventory,
    },
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
      label: "Cost Per Unit",
      ui: {
        description: "Purchase cost per unit for this lot",
      },
    }),
    location: text({
      label: "Location",
      ui: {
        description: "Warehouse zone/bin location (e.g., A-1-3)",
      },
    }),
    // Relationships
    product: relationship({
      ref: "Product.inventoryLots",
      label: "Product",
    }),
    supplier: relationship({
      ref: "Supplier.inventoryLots",
      label: "Supplier",
    }),
    ...trackingFields,
  },
});
