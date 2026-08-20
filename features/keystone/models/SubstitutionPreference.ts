import { list } from "@keystone-6/core";
import {
  checkbox,
  relationship,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';
import { isSignedIn, permissions } from "../access";
import { ownerScopedFilter } from '../lib/storeAccess';

export const SubstitutionPreference = list({
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
    labelField: "user",
    listView: {
      initialColumns: ["user", "allowSubstitutions", "preferSimilarBrand", "contactBeforeSubstitute"],
    },
  },
  fields: {
    // User who owns these preferences
    user: relationship({
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "User",
      label: "User",
      ui: {
        description: "The user these preferences belong to",
      },
    }),
    // Whether to allow substitutions at all
    allowSubstitutions: checkbox({
      defaultValue: true,
      label: "Allow Substitutions",
      ui: {
        description: "Whether to allow product substitutions when items are out of stock",
      },
    }),
    // Prefer same brand when substituting
    preferSimilarBrand: checkbox({
      defaultValue: true,
      label: "Prefer Similar Brand",
      ui: {
        description: "When substituting, prefer the same brand if possible",
      },
    }),
    // Prefer same size when substituting
    preferSimilarSize: checkbox({
      defaultValue: true,
      label: "Prefer Similar Size",
      ui: {
        description: "When substituting, prefer similar size/quantity if possible",
      },
    }),
    // Contact before substituting
    contactBeforeSubstitute: checkbox({
      defaultValue: false,
      label: "Contact Before Substitute",
      ui: {
        description: "Contact the customer before making any substitution",
      },
    }),
    ...trackingFields,
  },
});
