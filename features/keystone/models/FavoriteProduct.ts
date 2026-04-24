import { list } from "@keystone-6/core";
import {
  text,
  relationship,
  timestamp,
} from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { trackingFields } from "./trackingFields";

export const FavoriteProduct = list({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn,
    },
    filter: {
      query: ({ session }) => {
        // Users can only see their own favorites
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      update: ({ session }) => {
        // Users can only update their own favorites
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      delete: ({ session }) => {
        // Users can only delete their own favorites
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
    },
  },
  ui: {
    labelField: "product",
    listView: {
      initialColumns: ["user", "product", "favoritedAt"],
    },
  },
  fields: {
    // User who favorited the product
    user: relationship({
      ref: "User",
      label: "User",
      ui: {
        description: "The user who favorited this product",
      },
    }),
    // Product ID (text field as specified)
    product: text({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Product",
      ui: {
        description: "Product ID of the favorited product",
      },
    }),
    // When the product was favorited
    favoritedAt: timestamp({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      label: "Favorited At",
      ui: {
        description: "When this product was added to favorites",
      },
    }),
    ...trackingFields,
  },
});
