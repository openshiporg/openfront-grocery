import { list } from "@keystone-6/core";
import {
  text,
  select,
  relationship,
  multiselect,
  checkbox,
  integer,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';
import { isSignedIn, permissions } from "../access";
import { publicStoreScopedFilter, storeScopedFilter } from '../lib/storeAccess';

export const Department = list({
  access: {
    operation: {
      query: () => true, // Public can read departments
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts,
    },
    filter: {
      query: async ({ session, context }) => await permissions.canManageProducts({ session, context }) ? storeScopedFilter({ session }) : publicStoreScopedFilter(),
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
    labelField: "name",
    listView: {
      initialColumns: ["name", "handle", "temperatureZone", "sortOrder", "isActive"],
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
      label: "Department Name",
      ui: {
        description: "e.g., Produce, Meat, Dairy, Bakery, Frozen, etc.",
      },
    }),
    handle: text({
      isIndexed: "unique",
      label: "Handle",
      ui: {
        description: "URL-friendly identifier (e.g., 'produce', 'meat-seafood')",
      },
    }),
    description: text({
      ui: {
        displayMode: "textarea",
        description: "Brief description shown on storefront",
      },
    }),
    imageUrl: text({
      label: "Image URL",
      ui: {
        description: "URL of the department image",
      },
    }),
    sortOrder: integer({
      defaultValue: 0,
      label: "Sort Order",
      ui: {
        description: "Display order on storefront (lower numbers first)",
      },
    }),
    isActive: checkbox({
      defaultValue: true,
      label: "Active",
      ui: {
        description: "Show this department on the storefront",
      },
    }),
    temperatureZone: select({
      type: "enum",
      options: [
        { label: "Ambient", value: "ambient" },
        { label: "Refrigerated", value: "refrigerated" },
        { label: "Frozen", value: "frozen" },
      ],
      defaultValue: "ambient",
      label: "Temperature Zone",
      ui: {
        description: "Storage temperature requirements",
      },
    }),
    requiredLicenses: multiselect({
      access: { read: permissions.canManageProducts },
      type: "enum",
      options: [
        { label: "Alcohol License", value: "alcohol" },
        { label: "Tobacco License", value: "tobacco" },
        { label: "Pharmacy License", value: "pharmacy" },
      ],
      label: "Required Licenses",
      ui: {
        description: "Special licenses required to sell items in this department",
      },
    }),
    // Relationships
    store: relationship({
      ref: 'Store.departments',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageProducts, update: () => false },
    }),
    manager: relationship({
      access: { read: permissions.canManageProducts },
      ref: "User",
      label: "Department Manager",
      ui: {
        description: "User responsible for this department",
      },
    }),
    products: relationship({
      ref: "Product.departmentRef",
      many: true,
      label: "Products",
    }),
    ...trackingFields,
  },
});
