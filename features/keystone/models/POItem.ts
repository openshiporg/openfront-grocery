import { list } from "@keystone-6/core";
import {
  integer,
  float,
  relationship,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { isSignedIn, permissions } from "../access";

export const POItem = list({
  access: {
    operation: {
      query: permissions.canManageInventory,
      create: permissions.canManageInventory,
      update: permissions.canManageInventory,
      delete: permissions.canManageInventory,
    },
  },
  ui: {
    labelField: "id",
    listView: {
      initialColumns: ["product", "quantity", "unitCost", "purchaseOrder"],
    },
  },
  fields: {
    quantity: integer({
      validation: { isRequired: true, min: 1 },
      label: "Quantity",
    }),
    unitCost: float({
      validation: { isRequired: true },
      label: "Unit Cost",
      ui: {
        description: "Cost per unit from supplier",
      },
    }),
    quantityReceived: integer({
      defaultValue: 0,
      label: "Quantity Received",
      ui: {
        description: "Actual quantity received (may differ from ordered)",
      },
    }),
    // Relationships
    purchaseOrder: relationship({
      ref: "PurchaseOrder.items",
      label: "Purchase Order",
    }),
    product: relationship({
      ref: "Product",
      label: "Product",
    }),
    ...trackingFields,
  },
});
