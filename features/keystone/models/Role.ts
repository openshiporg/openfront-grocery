import { list } from "@keystone-6/core";
import {
  text,
  checkbox,
  relationship,
} from "@keystone-6/core/fields";
import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const Role = list({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageUsers,
      update: permissions.canManageUsers,
      delete: permissions.canManageUsers,
    },
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "canManageProducts", "canManageOrders", "canManageInventory", "canManageOnboarding", "canAccessDashboard"],
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
      label: "Role Name",
    }),
    // Permission flags
    canManageProducts: checkbox({
      defaultValue: false,
      label: "Can Manage Products",
    }),
    canManageOrders: checkbox({
      defaultValue: false,
      label: "Can Manage Orders",
    }),
    canManagePayments: checkbox({
      defaultValue: false,
      label: 'Can Manage Payments',
    }),
    canManageInventory: checkbox({
      defaultValue: false,
      label: "Can Manage Inventory",
    }),
    canManageSuppliers: checkbox({
      defaultValue: false,
      label: "Can Manage Suppliers",
    }),
    canManageDelivery: checkbox({
      defaultValue: false,
      label: "Can Manage Delivery Routes",
    }),
    canManageUsers: checkbox({
      defaultValue: false,
      label: "Can Manage Users",
    }),
    canManageOnboarding: checkbox({
      defaultValue: false,
      label: "Can Manage Onboarding",
    }),
    canAccessDashboard: checkbox({
      defaultValue: false,
      label: "Can Access Dashboard",
    }),
    // Relationships
    assignedTo: relationship({
      ref: "User.role",
      many: true,
      label: "Assigned To",
    }),
    ...trackingFields,
  },
});
