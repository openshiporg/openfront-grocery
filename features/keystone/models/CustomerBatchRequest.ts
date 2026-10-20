import { list } from '@keystone-6/core';
import { json, text } from '@keystone-6/core/fields';
import { trackingFields } from './trackingFields';

/**
 * The durable result of one customer batch action (adding a list or a past
 * order to the basket), keyed by the client's request key so a retry after a
 * lost response returns the original outcome instead of adding items twice.
 * Written only by addCartBatch; never exposed through generic CRUD.
 */
export const CustomerBatchRequest = list({
  access: { operation: { query: () => false, create: () => false, update: () => false, delete: () => false } },
  ui: { isHidden: true },
  fields: {
    requestKey: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
    storeId: text({ validation: { isRequired: true } }),
    ownerKey: text({ validation: { isRequired: true } }),
    kind: text({ validation: { isRequired: true } }),
    sourceId: text({ validation: { isRequired: true } }),
    results: json(),
    ...trackingFields,
  },
});
