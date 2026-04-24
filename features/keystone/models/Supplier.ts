import { list } from "@keystone-6/core";
import {
  text,
  select,
  float,
  relationship,
  multiselect,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { isSignedIn, permissions } from "../access";

export const Supplier = list({
  access: {
    operation: {
      query: permissions.canManageSuppliers,
      create: permissions.canManageSuppliers,
      update: permissions.canManageSuppliers,
      delete: permissions.canManageSuppliers,
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
      label: "Minimum Order Amount",
      ui: {
        description: "Minimum order value for this supplier",
      },
    }),
    // Relationships
    products: relationship({
      ref: "Product.supplier",
      many: true,
      label: "Products",
    }),
    inventoryLots: relationship({
      ref: "InventoryLot.supplier",
      many: true,
      label: "Inventory Lots",
    }),
    purchaseOrders: relationship({
      ref: "PurchaseOrder.supplier",
      many: true,
      label: "Purchase Orders",
    }),
    ...trackingFields,
  },
});
