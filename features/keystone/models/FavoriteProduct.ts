import { list } from "@keystone-6/core";
import {
  text,
  relationship,
  timestamp,
} from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { ownerScopedFilter } from '../lib/storeAccess';
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';

export const FavoriteProduct = list({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn,
    },
    filter: {
      query: ownerScopedFilter('user'),
      update: ownerScopedFilter('user'),
      delete: ownerScopedFilter('user'),
    },
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.itemId) throw new Error('An authenticated owner is required');
      return { ...resolvedData, user: { connect: { id: context.session.itemId } } };
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
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
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
      label: "Product Snapshot",
      ui: {
        description: "Legacy product display snapshot",
      },
    }),
    productRef: relationship({
      ref: 'Product.favoriteProducts',
      access: { create: () => false, update: () => false },
      label: 'Product',
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
