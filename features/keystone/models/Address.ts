import { list } from "@keystone-6/core";
import {
  text,
  relationship,
} from "@keystone-6/core/fields";
import { isSignedIn, permissions } from "../access";
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
      query: ({ session }) => {
        if (permissions.canManageUsers({ session })) {
          return true;
        }
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      update: ({ session }) => {
        if (permissions.canManageUsers({ session })) {
          return true;
        }
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      delete: ({ session }) => {
        if (permissions.canManageUsers({ session })) {
          return true;
        }
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
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
      ref: "User",
      label: "User",
    }),
    ...trackingFields,
  },
});
