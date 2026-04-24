import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import {
  text,
  password,
  relationship,
  select,
} from "@keystone-6/core/fields";
import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const User = list({
  access: {
    operation: {
      query: isSignedIn,
      create: () => true,
      update: isSignedIn,
      delete: permissions.canManageUsers,
    },
    filter: {
      query: ({ session }) => {
        if (permissions.canManageUsers({ session })) {
          return true;
        }
        return { id: { equals: session?.itemId } };
      },
      update: ({ session }) => {
        if (permissions.canManageUsers({ session })) {
          return true;
        }
        return { id: { equals: session?.itemId } };
      },
    },
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "email", "role", "onboardingStatus"],
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
      label: "Name",
    }),
    email: text({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Email",
    }),
    password: password({
      validation: { isRequired: true },
      access: {
        read: denyAll,
        update: ({ session, item }) =>
          permissions.canManageUsers({ session }) || session?.itemId === item.id,
      },
    }),
    role: relationship({
      ref: "Role.assignedTo",
      label: "Role",
    }),
    onboardingStatus: select({
      type: "enum",
      options: [
        { label: "Not Started", value: "not_started" },
        { label: "In Progress", value: "in_progress" },
        { label: "Completed", value: "completed" },
        { label: "Dismissed", value: "dismissed" },
      ],
      defaultValue: "not_started",
      label: "Onboarding Status",
    }),
    ...trackingFields,
  },
});
