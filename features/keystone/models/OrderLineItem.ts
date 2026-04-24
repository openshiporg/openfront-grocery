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

export const OrderLineItem = list({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageOrders,
      update: permissions.canManageOrders,
      delete: permissions.canManageOrders,
    },
    filter: {
      query: ({ session }) => {
        if (permissions.canManageOrders({ session })) {
          return true;
        }
        if (session?.itemId) {
          return { order: { user: { id: { equals: session.itemId } } } };
        }
        return false;
      },
    },
  },
  ui: {
    listView: {
      initialColumns: ["title", "quantity", "unitPrice", "order"],
    },
  },
  fields: {
    title: text({
      validation: { isRequired: true },
      label: "Product Title",
    }),
    sku: text({
      label: "SKU",
    }),
    quantity: integer({
      validation: { isRequired: true, min: 1 },
      label: "Quantity",
    }),
    unitPrice: float({
      validation: { isRequired: true },
      label: "Unit Price",
    }),
    thumbnail: text({
      label: "Thumbnail URL",
    }),
    metadata: json(),
    // Relationships
    order: relationship({
      ref: "Order.lineItems",
      label: "Order",
    }),
    product: relationship({
      ref: "Product",
      label: "Product",
    }),
    // Track which inventory lot was used (for FEFO)
    inventoryLot: relationship({
      ref: "InventoryLot",
      label: "Inventory Lot",
      ui: {
        description: "Inventory lot used to fulfill this line item",
      },
    }),
    ...trackingFields,
  },
});
