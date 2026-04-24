import { list } from '@keystone-6/core';
import { checkbox, decimal, json, relationship, text } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { trackingFields } from './trackingFields';

export const PaymentSession = list({
  access: {
    operation: {
      query: permissions.canManageOrders,
      create: permissions.canManageOrders,
      update: permissions.canManageOrders,
      delete: permissions.canManageOrders,
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
    data: json({ defaultValue: {} }),
    idempotencyKey: text(),
    cart: relationship({ ref: 'Cart.paymentSessions' }),
    paymentProvider: relationship({ ref: 'PaymentProvider.sessions' }),
    ...trackingFields,
  },
});
