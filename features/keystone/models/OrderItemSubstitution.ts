import { list } from '@keystone-6/core';
import { checkbox, relationship, text, timestamp } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { trackingFields } from './trackingFields';
import { nestedRelatedStoreScopedFilter } from '../lib/storeAccess';

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export const OrderItemSubstitution = list({
  access: {
    operation: {
      query: permissions.canManageOrders,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: { query: nestedRelatedStoreScopedFilter('lineItem', 'order'), update: nestedRelatedStoreScopedFilter('lineItem', 'order'), delete: nestedRelatedStoreScopedFilter('lineItem', 'order') },
  },
  hooks: {
    resolveInput: {
      create: async ({ resolvedData }) => ({
        ...resolvedData,
        orderItem: normalizeText(resolvedData.orderItem),
        originalProduct: normalizeText(resolvedData.originalProduct),
        substitutedProduct: normalizeText(resolvedData.substitutedProduct),
        reason: normalizeText(resolvedData.reason),
        idempotencyKey: normalizeText(resolvedData.idempotencyKey),
        approvedAt: resolvedData.customerApproved ? new Date().toISOString() : null,
      }),
      update: async ({ resolvedData, item }) => ({
        ...resolvedData,
        orderItem: normalizeText(resolvedData.orderItem),
        originalProduct: normalizeText(resolvedData.originalProduct),
        substitutedProduct: normalizeText(resolvedData.substitutedProduct),
        reason: normalizeText(resolvedData.reason),
        idempotencyKey: normalizeText(resolvedData.idempotencyKey),
        approvedAt: resolvedData.customerApproved === undefined
          ? undefined
          : resolvedData.customerApproved
            ? item.approvedAt || new Date().toISOString()
            : null,
      }),
    },
    validate: {
      create: async ({ resolvedData, addValidationError }) => {
        const lineItemId = resolvedData.lineItem?.connect?.id;
        if (!lineItemId || resolvedData.orderItem !== lineItemId) {
          addValidationError('Substitution line-item relation and snapshot ID must match');
        }
        if (!resolvedData.idempotencyKey || String(resolvedData.idempotencyKey).length < 12) {
          addValidationError('A valid substitution idempotency key is required');
        }
      },
      update: async ({ addValidationError }) => {
        addValidationError('Substitution evidence is append-only and cannot be updated');
      },
      delete: async ({ addValidationError }) => {
        addValidationError('Substitution evidence cannot be deleted');
      },
    },
    beforeOperation: {
      create: async ({ context }) => {
        if (!await permissions.canManageOrders({ session: context.session as any, context })) {
          throw new Error('You do not have permission to record substitutions');
        }
      },
      update: async ({ context }) => {
        if (!await permissions.canManageOrders({ session: context.session as any, context })) {
          throw new Error('You do not have permission to record substitutions');
        }
      },
    },
  },
  ui: {
    labelField: 'originalProduct',
    listView: {
      initialColumns: ['orderItem', 'originalProduct', 'substitutedProduct', 'customerApproved'],
    },
  },
  fields: {
    idempotencyKey: text({
      isIndexed: 'unique',
      validation: { isRequired: true },
      access: { update: () => false },
    }),
    orderItem: text({
      validation: { isRequired: true },
      access: { update: () => false },
      label: 'Order Item ID Snapshot',
      ui: { itemView: { fieldMode: 'read' } },
    }),
    lineItem: relationship({
      ref: 'OrderLineItem.substitutions',
      access: { update: () => false },
      ui: { itemView: { fieldMode: 'read' } },
    }),
    recordedBy: relationship({
      ref: 'User',
      access: { update: () => false },
      ui: { itemView: { fieldMode: 'read' } },
    }),
    originalProduct: text({
      validation: { isRequired: true },
      access: { update: () => false },
      label: 'Original Product Snapshot',
      ui: { itemView: { fieldMode: 'read' } },
    }),
    substitutedProduct: text({
      validation: { isRequired: true },
      access: { update: () => false },
      label: 'Substituted Product Snapshot',
    }),
    reason: text({
      access: { update: () => false },
      ui: { displayMode: 'textarea', itemView: { fieldMode: 'read' } },
    }),
    customerApproved: checkbox({
      access: { update: () => false },
      defaultValue: false,
      ui: { itemView: { fieldMode: 'read' } },
    }),
    approvedAt: timestamp({ access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
});
