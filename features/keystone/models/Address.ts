import { list } from "@keystone-6/core";
import {
  text,
  relationship,
  checkbox,
} from "@keystone-6/core/fields";
import { isCurrentAccount, isSignedIn, permissions } from "../access";
import { ownerScopedFilter, ownerStoreScopedFilter } from '../lib/storeAccess';
import { trackingFields } from "./trackingFields";

export const Address = list({
  access: {
    operation: {
      query: isSignedIn,
      create: isCurrentAccount,
      update: isCurrentAccount,
      delete: isCurrentAccount,
    },
    filter: {
      query: async ({ session, context }) => {
        const store = await ownerStoreScopedFilter('user')({ session, context });
        if (store === false) return false;
        if (await permissions.canManageUsers({ session, context })) return store;
        if (session?.itemId) return { AND: [store, { user: { id: { equals: session.itemId } } }] };
        return false;
      },
      // Customers manage their saved address book; addresses written by checkout
      // stay attached to their order evidence.
      update: async (args) => {
        const owner = await ownerScopedFilter('user')(args);
        return owner === false ? false : { AND: [owner, { isSaved: { equals: true } }] };
      },
      delete: async (args) => {
        const owner = await ownerScopedFilter('user')(args);
        return owner === false ? false : { AND: [owner, { isSaved: { equals: true } }] };
      },
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
    // Address-book entries the customer saved. Addresses written by checkout
    // belong to their order and are not offered for reuse.
    isSaved: checkbox({
      defaultValue: false,
      label: "Saved to address book",
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
