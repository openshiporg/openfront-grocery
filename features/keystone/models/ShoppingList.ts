import { list } from "@keystone-6/core";
import {
  text,
  relationship,
  checkbox,
} from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { trackingFields } from "./trackingFields";

export const ShoppingList = list({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn,
    },
    filter: {
      query: ({ session }) => {
        // Users can only see their own shopping lists
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      update: ({ session }) => {
        // Users can only update their own shopping lists
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      delete: ({ session }) => {
        // Users can only delete their own shopping lists
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
    },
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "user", "isDefault", "createdAt"],
    },
  },
  fields: {
    // Owner of the shopping list
    user: relationship({
      ref: "User",
      label: "User",
      ui: {
        description: "The user who owns this shopping list",
      },
    }),
    // Name of the shopping list
    name: text({
      validation: { isRequired: true },
      label: "Name",
      ui: {
        description: "Name of the shopping list (e.g., 'Weekly Groceries', 'Party Supplies')",
      },
    }),
    // Whether this is the user's default list
    isDefault: checkbox({
      defaultValue: false,
      label: "Default List",
      ui: {
        description: "Whether this is the user's default shopping list",
      },
    }),
    // Items in this shopping list
    items: relationship({
      ref: "ShoppingListItem.list",
      many: true,
      label: "Items",
      ui: {
        description: "Items in this shopping list",
      },
    }),
    ...trackingFields,
  },
});
