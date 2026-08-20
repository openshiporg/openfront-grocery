import { list } from "@keystone-6/core";
import {
  text,
  select,
  float,
  integer,
  relationship,
  multiselect,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';
import { permissions } from "../access";
import { storeScopedFilter } from '../lib/storeAccess';

export const Supplier = list({
  access: {
    operation: {
      query: permissions.canManageSuppliers,
      create: permissions.canManageSuppliers,
      update: permissions.canManageSuppliers,
      delete: permissions.canManageSuppliers,
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
    validate: {
      delete: async ({ item, context, addValidationError }) => {
        const [lotCount, purchaseOrderCount, productCount] = await Promise.all([
          context.prisma.inventoryLot.count({ where: { supplierId: String(item.id) } }),
          context.prisma.purchaseOrder.count({ where: { supplierId: String(item.id) } }),
          context.prisma.product.count({ where: { supplierId: String(item.id) } }),
        ]);
        if (lotCount > 0 || purchaseOrderCount > 0 || productCount > 0) {
          addValidationError('Suppliers with products, inventory, or purchase orders cannot be deleted');
        }
      },
    },
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "contactName", "email", "paymentTerms"],
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
      label: "Supplier Name",
    }),
    contactName: text({
      label: "Contact Name",
    }),
    email: text({
      validation: { isRequired: true },
      label: "Email",
    }),
    phone: text({
      label: "Phone",
    }),
    paymentTerms: select({
      type: "enum",
      options: [
        { label: "Net 30", value: "net_30" },
        { label: "Net 60", value: "net_60" },
        { label: "Cash on Delivery", value: "cod" },
      ],
      defaultValue: "net_30",
      label: "Payment Terms",
    }),
    deliveryDays: multiselect({
      type: "enum",
      options: [
        { label: "Monday", value: "mon" },
        { label: "Tuesday", value: "tue" },
        { label: "Wednesday", value: "wed" },
        { label: "Thursday", value: "thu" },
        { label: "Friday", value: "fri" },
        { label: "Saturday", value: "sat" },
        { label: "Sunday", value: "sun" },
      ],
      label: "Delivery Days",
      ui: {
        description: "Days of the week supplier delivers",
      },
    }),
    minimumOrder: float({
      access: { update: () => false },
      label: "Minimum Order Amount (legacy display)",
      ui: { description: "Legacy display value; minimumOrderCents is authoritative" },
    }),
    minimumOrderCents: integer({
      defaultValue: 0,
      validation: { isRequired: true, min: 0 },
      access: { create: () => false, update: () => false },
      label: "Minimum Order (minor units)",
    }),
    // Relationships
    store: relationship({
      ref: 'Store.suppliers',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageSuppliers, update: () => false },
    }),
    products: relationship({
      access: { update: () => false },
      ref: "Product.supplier",
      many: true,
      label: "Products",
    }),
    inventoryLots: relationship({
      access: { update: () => false },
      ref: "InventoryLot.supplier",
      many: true,
      label: "Inventory Lots",
    }),
    purchaseOrders: relationship({
      access: { update: () => false },
      ref: "PurchaseOrder.supplier",
      many: true,
      label: "Purchase Orders",
    }),
    ...trackingFields,
  },
});
