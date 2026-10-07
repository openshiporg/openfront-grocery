import { list } from '@keystone-6/core';
import { integer, json, relationship, select, text } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { nestedRelatedStoreScopedFilter } from '../lib/storeAccess';
import { trackingFields } from './trackingFields';

// Original checkout lines and allocations remain immutable. This record is the
// single committed physical/commercial resolution, written only by the domain.
export const OrderLineFulfillment = list({
  access: {
    operation: { query: permissions.canManageOrders, create: () => false, update: () => false, delete: () => false },
    filter: { query: nestedRelatedStoreScopedFilter('lineItem', 'order') },
  },
  fields: {
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    lineItemIdSnapshot: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    lineItem: relationship({ ref: 'OrderLineItem.fulfillment' }),
    product: relationship({ ref: 'Product' }),
    recordedBy: relationship({ ref: 'User' }),
    resolution: select({ options: ['picked', 'short', 'substituted'], validation: { isRequired: true } }),
    productTitle: text({ validation: { isRequired: true } }),
    productSku: text(),
    unitOfMeasure: text({ validation: { isRequired: true } }),
    quantityMilli: integer({ validation: { isRequired: true, min: 0 } }),
    grossMilli: integer({ validation: { isRequired: true, min: 0 } }),
    tareMilli: integer({ validation: { isRequired: true, min: 0 } }),
    unitPriceCents: integer({ validation: { isRequired: true, min: 0 } }),
    subtotalCents: integer({ validation: { isRequired: true, min: 0 } }),
    taxRateBasisPoints: integer({ validation: { isRequired: true, min: 0, max: 10000 } }),
    allocations: json(),
    evidence: json(),
    ...trackingFields,
  },
});
