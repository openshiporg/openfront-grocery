import { list } from '@keystone-6/core';
import { integer, json, relationship, select, text } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { currentMembershipRelatedStoreScopedFilter } from '../lib/storeAccess';
import { trackingFields } from './trackingFields';
export const OrderSettlement = list({
  access: { operation: { query: permissions.canManagePayments, create:()=>false,update:()=>false,delete:()=>false },filter:{query:currentMembershipRelatedStoreScopedFilter('order')} },
  fields: {
    order: relationship({ref:'Order'}),
    idempotencyKey:text({isIndexed:'unique',validation:{isRequired:true}}),
    actualsHash:text({validation:{isRequired:true}}),
    status:select({options:['processing','requires_customer_authorization','finalized','abandoned'],defaultValue:'processing'}),
    totalCents:integer({validation:{isRequired:true,min:0}}),
    // Contains private consent and lot evidence; require order capability beyond the list's payment gate.
    snapshot: json({ access: { read: permissions.canManageOrders } }),
    // Contains provider client secrets and internal lease tokens; keep off generic GraphQL reads.
    providerEvidence: json({ access: { read: () => false } }),
    // Failure messages preserve caught provider/operation errors; require order capability beyond the payment list gate.
    failureMessage: text({ access: { read: permissions.canManageOrders } }),
    finalizedBy:relationship({ref:'User'}),
    ...trackingFields,
  },
});
