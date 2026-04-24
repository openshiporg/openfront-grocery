import { list } from "@keystone-6/core";
import {
  text,
  select,
  float,
  timestamp,
  relationship,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { isSignedIn, permissions } from "../access";

export const PurchaseOrder = list({
  access: {
    operation: {
      query: permissions.canManageInventory,
      create: permissions.canManageInventory,
      update: permissions.canManageInventory,
      delete: permissions.canManageInventory,
    },
  },
  ui: {
    labelField: "poNumber",
    listView: {
      initialColumns: ["poNumber", "supplier", "orderDate", "status", "totalAmount"],
    },
  },
  fields: {
    poNumber: text({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "PO Number",
      ui: {
        description: "Auto-generated purchase order number",
      },
      hooks: {
        resolveInput: async ({ operation, resolvedData, context }) => {
          if (operation === "create" && !resolvedData.poNumber) {
            // Auto-generate PO number
            const date = new Date();
            const prefix = `PO-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
            const count = await context.query.PurchaseOrder.count({
              where: {
                poNumber: {
                  startsWith: prefix,
                },
              },
            });
            return `${prefix}-${String(count + 1).padStart(4, '0')}`;
          }
          return resolvedData.poNumber;
        },
      },
    }),
    orderDate: timestamp({
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
      label: "Order Date",
    }),
    expectedDeliveryDate: timestamp({
      label: "Expected Delivery Date",
      ui: {
        description: "When we expect to receive this order",
      },
    }),
    status: select({
      type: "enum",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Sent", value: "sent" },
        { label: "Confirmed", value: "confirmed" },
        { label: "Received", value: "received" },
        { label: "Cancelled", value: "cancelled" },
      ],
      defaultValue: "draft",
      label: "Status",
    }),
    totalAmount: float({
      label: "Total Amount",
      ui: {
        description: "Total value of this purchase order",
      },
    }),
    receivedAt: timestamp({
      label: "Received At",
      ui: {
        description: "When the order was actually received",
      },
    }),
    notes: text({
      ui: {
        displayMode: "textarea",
      },
      label: "Notes",
    }),
    // Relationships
    supplier: relationship({
      ref: "Supplier.purchaseOrders",
      label: "Supplier",
    }),
    items: relationship({
      ref: "POItem.purchaseOrder",
      many: true,
      label: "Items",
      ui: {
        displayMode: "cards",
        cardFields: ["product", "quantity", "unitCost"],
        inlineCreate: { fields: ["product", "quantity", "unitCost"] },
        inlineEdit: { fields: ["product", "quantity", "unitCost"] },
      },
    }),
    ...trackingFields,
  },
});
