import { list } from "@keystone-6/core";
import {
  text,
  relationship,
} from "@keystone-6/core/fields";
import { isSignedIn, permissions } from "../access";
import { ownerScopedFilter, ownerStoreScopedFilter } from '../lib/storeAccess';
import { trackingFields } from "./trackingFields";

export const Address = list({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn,
    },
    filter: {
      query: async ({ session, context }) => {
        const store = ownerStoreScopedFilter('user')({ session });
        if (store === false) return false;
        if (await permissions.canManageUsers({ session, context })) return store;
        if (session?.itemId) return { AND: [store, { user: { id: { equals: session.itemId } } }] };
        return false;
      },
      update: ownerScopedFilter('user'),
      delete: ownerScopedFilter('user'),
    },
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.itemId) return resolvedData;
      return { ...resolvedData, user: { connect: { id: context.session.itemId } } };
    },
  },
  ui: {
    listView: {
      initialColumns: ["firstName", "lastName", "city", "postalCode"],
    },
  },
  fields: {
    firstName: text({
      label: "First Name",
    }),
    lastName: text({
      label: "Last Name",
    }),
    company: text({
      label: "Company",
    }),
    address1: text({
      validation: { isRequired: true },
      label: "Address Line 1",
    }),
    address2: text({
      label: "Address Line 2",
    }),
    city: text({
      validation: { isRequired: true },
      label: "City",
    }),
    province: text({
      label: "Province/State",
    }),
    postalCode: text({
      validation: { isRequired: true },
      label: "Postal Code",
    }),
    phone: text({
      label: "Phone",
    }),
    // Relationships
    user: relationship({
      access: { create: () => false, update: () => false },
      ref: "User",
      label: "User",
    }),
    ...trackingFields,
  },
});
