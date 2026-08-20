import { list } from "@keystone-6/core";
import {
  text,
  select,
  float,
  integer,
  timestamp,
  relationship,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';
import { permissions } from "../access";
import { storeScopedFilter } from '../lib/storeAccess';

function canUpdateDraftPurchaseOrder({ item }: {
  item: { id: { toString(): string }; [key: string]: unknown };
}) {
  return item.status === 'draft';
}

export const PurchaseOrder = list({
  access: {
    operation: {
      query: permissions.canManageInventory,
      create: () => false,
      update: permissions.canManageInventory,
      delete: permissions.canManageInventory,
    },
    filter: { query: storeScopedFilter, update: storeScopedFilter, delete: storeScopedFilter },
  },
  hooks: {
    validate: {
      delete: async ({ item, context, addValidationError }) => {
        const purchaseOrderId = String(item.id);
        const [purchaseOrder, itemCount] = await Promise.all([
          context.sudo().query.PurchaseOrder.findOne({
            where: { id: purchaseOrderId },
            query: 'status',
          }),
          context.prisma.pOItem.count({ where: { purchaseOrderId } }),
        ]);
        if (purchaseOrder?.status !== 'draft') {
          addValidationError('Only draft purchase orders can be deleted');
        }
        if (itemCount > 0) {
          addValidationError('Draft purchase orders with items cannot be deleted');
        }
      },
    },
  },
  ui: {
    labelField: "poNumber",
    listView: {
      initialColumns: ["poNumber", "supplier", "orderDate", "status", "totalAmount"],
    },
  },
  fields: {
    poNumber: text({
      access: { update: () => false },
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "PO Number",
      ui: {
        description: "Generated transactionally by the purchase-order draft workflow",
      },
    }),
    idempotencyKey: text({
      isIndexed: 'unique',
      db: { isNullable: true },
      access: { create: () => false, update: () => false },
      ui: { itemView: { fieldMode: 'hidden' } },
    }),
    supplierName: text({
      access: { create: () => false, update: () => false },
      validation: { isRequired: true },
      label: "Supplier Name Snapshot",
    }),
    supplierEmail: text({
      access: { create: () => false, update: () => false },
      label: "Supplier Email Snapshot",
    }),
    orderDate: timestamp({
      access: { update: () => false },
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
      label: "Order Date",
    }),
    expectedDeliveryDate: timestamp({
      access: { update: canUpdateDraftPurchaseOrder },
      label: "Expected Delivery Date",
      ui: {
        description: "When we expect to receive this order",
      },
    }),
    status: select({
      access: { create: () => false, update: () => false },
      type: "enum",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Sent", value: "sent" },
        { label: "Confirmed", value: "confirmed" },
        { label: "Received", value: "received" },
        { label: "Cancelled", value: "cancelled" },
      ],
      defaultValue: "draft",
      label: "Status",
    }),
    totalAmount: float({
      access: { update: () => false },
      label: "Total Amount (legacy display)",
      ui: { description: "Legacy display value; totalAmountCents is authoritative" },
    }),
    totalAmountCents: integer({
      access: { create: () => false, update: () => false },
      defaultValue: 0,
      validation: { isRequired: true, min: 0 },
      label: "Total Amount (minor units)",
    }),
    receivedAt: timestamp({
      access: { create: () => false, update: () => false },
      label: "Received At",
      ui: {
        description: "When the order was actually received",
      },
    }),
    notes: text({
      access: { update: canUpdateDraftPurchaseOrder },
      ui: {
        displayMode: "textarea",
      },
      label: "Notes",
    }),
    // Relationships
    store: relationship({
      ref: 'Store.purchaseOrders',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false },
    }),
    supplier: relationship({
      access: { update: () => false },
      ref: "Supplier.purchaseOrders",
      label: "Supplier",
    }),
    items: relationship({
      access: { update: () => false },
      ref: "POItem.purchaseOrder",
      many: true,
      label: "Items",
      ui: {
        displayMode: "cards",
        cardFields: ["product", "quantity", "unitCost"],
        inlineCreate: { fields: ["product", "quantity", "unitCost"] },
        inlineEdit: { fields: ["product", "quantity", "unitCost"] },
      },
    }),
    ...trackingFields,
  },
});
