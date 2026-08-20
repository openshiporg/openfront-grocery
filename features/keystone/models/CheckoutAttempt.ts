import { list } from '@keystone-6/core';
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { storeScopedFilter } from '../lib/storeAccess';
import { trackingFields } from './trackingFields';

export const CheckoutAttempt = list({
  access: {
    operation: { query: permissions.canManageOrders, create: () => false, update: () => false, delete: () => false },
    filter: { query: storeScopedFilter, update: storeScopedFilter, delete: storeScopedFilter },
  },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true }, access: { update: () => false } }),
    providerCode: text({ validation: { isRequired: true }, access: { update: () => false } }),
    providerPaymentId: text({ validation: { isRequired: true }, access: { update: () => false } }),
    amountCents: integer({ validation: { isRequired: true, min: 0 }, access: { update: () => false } }),
    currencyCode: text({ validation: { isRequired: true }, access: { update: () => false } }),
    status: select({
      type: 'enum',
      options: [
        { label: 'Pending settlement verification', value: 'pending' },
        { label: 'Settled pending finalize', value: 'settled_pending_finalize' },
        { label: 'Finalizing', value: 'finalizing' },
        { label: 'Finalized', value: 'finalized' },
        { label: 'Compensation required', value: 'compensation_required' },
        { label: 'Compensation processing', value: 'compensation_processing' },
        { label: 'Compensated', value: 'compensated' },
        { label: 'Failed', value: 'failed' },
      ],
      defaultValue: 'pending',
      validation: { isRequired: true },
    }),
    attempts: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    fencingToken: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 }, access: { update: () => false } }),
    leaseToken: text({ db: { isNullable: true }, access: { update: () => false } }),
    leaseExpiresAt: timestamp({ access: { update: () => false } }),
    lastError: text({ access: { update: () => false } }),
    requestData: json({ defaultValue: {}, access: { update: () => false } }),
    settledAt: timestamp(),
    finalizedAt: timestamp(),
    compensationAt: timestamp(),
    store: relationship({ ref: 'Store.checkoutAttempts', db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } }, access: { create: () => false, update: () => false } }),
    cart: relationship({ ref: 'Cart.checkoutAttempts', db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } }, access: { create: () => false, update: () => false } }),
    paymentSession: relationship({ ref: 'PaymentSession.checkoutAttempts', db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } }, access: { create: () => false, update: () => false } }),
    order: relationship({ ref: 'Order.checkoutAttempts', access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
});
