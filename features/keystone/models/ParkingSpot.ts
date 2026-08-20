import { list } from "@keystone-6/core";
import {
  text,
  checkbox,
  relationship,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';
import { isSignedIn, permissions } from "../access";
import { storeScopedFilter } from '../lib/storeAccess';

export const ParkingSpot = list({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageDelivery,
      update: permissions.canManageDelivery,
      delete: () => false,
    },
    filter: {
      query: storeScopedFilter,
      update: storeScopedFilter,
      delete: storeScopedFilter,
    },
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.data.store?.id) throw new Error('An active store is required');
      return { ...resolvedData, store: { connect: { id: context.session.data.store.id } } };
    },
  },
  ui: {
    labelField: "spotNumber",
    listView: {
      initialColumns: ["spotNumber", "description", "isAccessible", "isAvailable"],
    },
  },
  fields: {
    store: relationship({
      ref: 'Store.parkingSpots',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageDelivery, update: () => false },
    }),
    spotNumber: text({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Spot Number",
      ui: {
        description: "Unique identifier for this parking spot (e.g., 'A1', 'B2')",
      },
    }),
    description: text({
      label: "Description",
      ui: {
        displayMode: "textarea",
        description: "Additional details about this spot location",
      },
    }),
    isAccessible: checkbox({
      defaultValue: false,
      label: "Is Accessible",
      ui: {
        description: "Whether this spot is ADA accessible",
      },
    }),
    isAvailable: checkbox({
      access: { update: () => false },
      defaultValue: true,
      label: "Is Available",
      ui: {
        description: "Whether this spot is currently available for curbside pickup",
      },
    }),
    ...trackingFields,
  },
});
