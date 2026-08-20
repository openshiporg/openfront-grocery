import { list } from '@keystone-6/core';
import { integer, text, timestamp } from '@keystone-6/core/fields';
import { trackingFields } from './trackingFields';

export const RateLimitBucket = list({
  access: { operation: { query: () => false, create: () => false, update: () => false, delete: () => false } },
  ui: { isHidden: true },
  fields: {
    key: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
    windowStartedAt: timestamp({ validation: { isRequired: true } }),
    requestCount: integer({ validation: { isRequired: true, min: 0 } }),
    ...trackingFields,
  },
});
