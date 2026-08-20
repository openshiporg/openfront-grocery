import { list } from "@keystone-6/core";
import {
  text,
  integer,
  float,
  relationship,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { permissions } from "../access";
import { relatedStoreScopedFilter } from '../lib/storeAccess';

export const POItem = list({
  access: {
    operation: {
      query: permissions.canManageInventory,
      create: () => false,
      update: permissions.canManageInventory,
      delete: () => false,
    },
    filter: { query: relatedStoreScopedFilter('purchaseOrder'), update: relatedStoreScopedFilter('purchaseOrder'), delete: relatedStoreScopedFilter('purchaseOrder') },
  },
  hooks: {
    validate: {
      create: async ({ resolvedData, context, addValidationError }) => {
        const purchaseOrderId = resolvedData.purchaseOrder?.connect?.id;
        const purchaseOrder = purchaseOrderId
          ? await context.sudo().query.PurchaseOrder.findOne({
              where: { id: String(purchaseOrderId) },
              query: 'status',
            })
          : null;
        if (purchaseOrder?.status !== 'draft') {
          addValidationError('Purchase order items can only be added to draft purchase orders');
        }
      },
      delete: async ({ item, context, addValidationError }) => {
        const poItem = await context.sudo().query.POItem.findOne({
          where: { id: String(item.id) },
          query: 'purchaseOrder { status }',
        });
        if (poItem?.purchaseOrder?.status !== 'draft') {
          addValidationError('Purchase order items can only be deleted from draft purchase orders');
        }
      },
    },
  },
  ui: {
    labelField: "id",
    listView: {
      initialColumns: ["product", "quantity", "unitCost", "purchaseOrder"],
    },
  },
  fields: {
    productTitle: text({
      access: { create: () => false, update: () => false },
      validation: { isRequired: true },
      label: "Product Title Snapshot",
    }),
    productSku: text({
      access: { create: () => false, update: () => false },
      label: "Product SKU Snapshot",
    }),
    quantity: integer({
      access: { update: () => false },
      validation: { isRequired: true, min: 1 },
      label: "Quantity",
    }),
    unitCost: float({
      access: { update: () => false },
      validation: { isRequired: true },
      label: "Unit Cost (legacy display)",
      ui: { description: "Legacy display value; unitCostCents is authoritative" },
    }),
    unitCostCents: integer({
      access: { create: () => false, update: () => false },
      defaultValue: 0,
      validation: { isRequired: true, min: 0 },
      label: "Unit Cost (minor units)",
    }),
    quantityReceived: integer({
      access: { create: () => false, update: () => false },
      defaultValue: 0,
      label: "Quantity Received",
      ui: {
        description: "Actual quantity received (may differ from ordered)",
      },
    }),
    // Relationships
    purchaseOrder: relationship({
      access: { update: () => false },
      ref: "PurchaseOrder.items",
      label: "Purchase Order",
    }),
    product: relationship({
      access: { update: () => false },
      ref: "Product",
      label: "Product",
    }),
    ...trackingFields,
  },
});
