import { list } from '@keystone-6/core';
import { relationship, select, text } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { storeScopedFilter } from '../lib/storeAccess';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { trackingFields } from './trackingFields';

const readOnly = { create: () => false, update: () => false };

// Storefront contact inbox (adapted from Gym's ContactMessage). Created only by the public
// submitGroceryContactMessage mutation; order staff read it and track follow-up status.
export const ContactMessage = list({
  access: {
    operation: { query: permissions.canManageOrders, create: () => false, update: permissions.canManageOrders, delete: () => false },
    filter: { query: storeScopedFilter, update: storeScopedFilter },
  },
  ui: {
    labelField: 'subject',
    listView: { initialColumns: ['subject', 'email', 'topic', 'status', 'createdAt'], initialSort: { field: 'createdAt', direction: 'DESC' } },
  },
  fields: {
    store: relationship({ ref: 'Store', access: readOnly, db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true } } }),
    customer: relationship({ ref: 'User', access: readOnly, ui: { description: 'Signed-in shopper who sent the message, if any' } }),
    reference: text({ access: readOnly, isIndexed: 'unique', validation: { isRequired: true } }),
    subject: text({ access: readOnly }),
    name: text({ access: readOnly, validation: { isRequired: true } }),
    email: text({ access: readOnly, validation: { isRequired: true } }),
    phone: text({ access: readOnly }),
    topic: text({ access: readOnly }),
    orderNumber: text({ access: readOnly, ui: { description: 'Order number the shopper referred to, as typed' } }),
    message: text({ access: readOnly, validation: { isRequired: true }, ui: { displayMode: 'textarea' } }),
    sourcePath: text({ access: readOnly, ui: { description: 'Storefront page the message was sent from' } }),
    status: select({
      type: 'string',
      options: [
        { label: 'New', value: 'new' },
        { label: 'In progress', value: 'in_progress' },
        { label: 'Replied', value: 'replied' },
        { label: 'Closed', value: 'closed' },
      ],
      defaultValue: 'new',
      validation: { isRequired: true },
      ui: { displayMode: 'segmented-control' },
    }),
    staffNotes: text({ ui: { displayMode: 'textarea', description: 'Internal notes; never shown to the sender' } }),
    ...trackingFields,
  },
});
