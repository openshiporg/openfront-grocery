import { list } from "@keystone-6/core";
import {
  checkbox,
  relationship,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { isSignedIn, permissions } from "../access";

export const SubstitutionPreference = list({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn,
    },
    filter: {
      query: ({ session }) => {
        // Admins can see all preferences
        if (permissions.canManageOrders({ session })) {
          return true;
        }
        // Users can only see their own preferences
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      update: ({ session }) => {
        // Admins can update all preferences
        if (permissions.canManageOrders({ session })) {
          return true;
        }
        // Users can only update their own preferences
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      delete: ({ session }) => {
        // Admins can delete all preferences
        if (permissions.canManageOrders({ session })) {
          return true;
        }
        // Users can only delete their own preferences
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
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
