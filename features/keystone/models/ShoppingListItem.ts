import { list } from "@keystone-6/core";
import {
  text,
  relationship,
  integer,
  checkbox,
  timestamp,
} from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';

export const ShoppingListItem = list({
  access: {
    operation: {
      query: isSignedIn,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: {
      query: ({ session }) => {
        // Users can only see items from their own shopping lists
        if (session?.itemId) {
          return { list: { user: { id: { equals: session.itemId } } } };
        }
        return false;
      },
      update: ({ session }) => {
        // Users can only update items from their own shopping lists
        if (session?.itemId) {
          return { list: { user: { id: { equals: session.itemId } } } };
        }
        return false;
      },
      delete: ({ session }) => {
        // Users can only delete items from their own shopping lists
        if (session?.itemId) {
          return { list: { user: { id: { equals: session.itemId } } } };
        }
        return false;
      },
    },
  },
  ui: {
    labelField: "product",
    listView: {
      initialColumns: ["product", "list", "quantity", "unit", "checked", "addedAt"],
    },
  },
  fields: {
    // Shopping list this item belongs to
    list: relationship({
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false },
      ref: "ShoppingList.items",
      label: "Shopping List",
      ui: {
        description: "The shopping list this item belongs to",
      },
    }),
    // Product name or ID
    product: text({
      validation: { isRequired: true },
      label: "Product Snapshot",
      ui: {
        description: "Legacy product name snapshot",
      },
    }),
    productRef: relationship({
      ref: 'Product.shoppingListItems',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false },
      label: 'Product',
    }),
    // Quantity needed
    quantity: integer({
      defaultValue: 1,
      validation: { isRequired: true, min: 1 },
      label: "Quantity",
      ui: {
        description: "Number of units needed",
      },
    }),
    // Unit of measurement
    unit: text({
      label: "Unit",
      ui: {
        description: "Unit of measurement (e.g., 'lbs', 'oz', 'each', 'dozen')",
      },
    }),
    // Whether the item has been checked off
    checked: checkbox({
      defaultValue: false,
      label: "Checked",
      ui: {
        description: "Whether this item has been checked off the list",
      },
    }),
    // Additional notes
    notes: text({
      label: "Notes",
      ui: {
        description: "Additional notes (e.g., 'organic only', 'brand preference')",
        displayMode: "textarea",
      },
    }),
    // When the item was added
    addedAt: timestamp({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      label: "Added At",
      ui: {
        description: "When this item was added to the list",
      },
    }),
    ...trackingFields,
  },
});
