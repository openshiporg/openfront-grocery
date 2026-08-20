import { list } from "@keystone-6/core";
import {
  text,
  relationship,
  checkbox,
} from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';
import { ownerStoreScopedFilter } from '../lib/storeAccess';

export const ShoppingList = list({
  access: {
    operation: {
      query: isSignedIn,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: {
      query: ({ session }) => {
        const store = ownerStoreScopedFilter('user')({ session });
        return session?.itemId && store !== false ? { AND: [store, { user: { id: { equals: session.itemId } } }] } : false;
      },
      update: ({ session }) => {
        const store = ownerStoreScopedFilter('user')({ session });
        return session?.itemId && store !== false ? { AND: [store, { user: { id: { equals: session.itemId } } }] } : false;
      },
      delete: ({ session }) => {
        const store = ownerStoreScopedFilter('user')({ session });
        return session?.itemId && store !== false ? { AND: [store, { user: { id: { equals: session.itemId } } }] } : false;
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
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false },
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
