import { list } from '@keystone-6/core';
import { checkbox, decimal, integer, json, relationship, text } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { trackingFields } from './trackingFields';
import { relatedStoreScopedFilter } from '../lib/storeAccess';

export const PaymentSession = list({
  access: {
    operation: {
      query: permissions.canManageOrders,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: {
      query: relatedStoreScopedFilter('cart'),
      update: relatedStoreScopedFilter('cart'),
      delete: relatedStoreScopedFilter('cart'),
    },
  },
  ui: {
    listView: {
      initialColumns: ['paymentProvider', 'amount', 'isSelected', 'isInitiated'],
    },
  },
  fields: {
    isSelected: checkbox({ defaultValue: false }),
    isInitiated: checkbox({ defaultValue: false }),
    amount: decimal({
      precision: 10,
      scale: 2,
      validation: { isRequired: true },
      defaultValue: '0.00',
    }),
    amountCents: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 }, access: { create: () => false, update: () => false } }),
    reservedOrderDisplayId: integer({ db: { isNullable: true }, isIndexed: 'unique', access: { create: () => false, update: () => false }, validation: { min: 1 }, label: 'Reserved order number' }),
    data: json({ defaultValue: {} }),
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true }, access: { create: () => false, update: () => false } }),
    cart: relationship({ ref: 'Cart.paymentSessions', access: { create: () => false, update: () => false } }),
    checkoutAttempts: relationship({ ref: 'CheckoutAttempt.paymentSession', many: true }),
    paymentProvider: relationship({ ref: 'PaymentProvider.sessions' }),
    ...trackingFields,
  },
});
