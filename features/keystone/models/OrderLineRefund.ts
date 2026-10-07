import { list } from '@keystone-6/core';
import { text, integer, json, select, relationship, timestamp } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { storeScopedFilter } from '../lib/storeAccess';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { trackingFields } from './trackingFields';

export const OrderLineRefund = list({
  access: { operation: { query: permissions.canManagePayments, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }), requestKey: text({ isIndexed: true }), providerRefundKey: text({ isIndexed: true }), inputFingerprint: text(),
    store: relationship({ ref: 'Store', db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }), order: relationship({ ref: 'Order' }), payment: relationship({ ref: 'Payment' }), paymentRefund: relationship({ ref: 'PaymentRefund' }), lineItem: relationship({ ref: 'OrderLineItem' }),
    finalSettlementId: text(), finalFulfillmentId: text(), productId: text(), productTitle: text(), unitOfMeasure: text(), currencyCode: text(),
    quantityMilli: integer({ validation: { isRequired: true, min: 1 } }), quantityBefore: integer(), quantityAfter: integer(), fulfilledQuantityMilli: integer(),
    subtotalCents: integer(), discountCents: integer(), netGoodsCents: integer(), taxCents: integer(), totalCents: integer(), taxRateBasisPoints: integer(),
    disposition: select({ options: ['refund_only', 'return_to_stock', 'waste', 'quarantine'], validation: { isRequired: true } }), conditionNote: text(), returnedLots: json(),
    reason: text(), requestedBy: text(), status: select({ options: ['reserved', 'processing', 'succeeded', 'failed', 'canceled'], defaultValue: 'reserved' }), failureMessage: text(), processedAt: timestamp(), events: json(),
    ...trackingFields,
  },
});
