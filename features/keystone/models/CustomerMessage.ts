import {list} from '@keystone-6/core';
import {integer,json,relationship,text,timestamp} from '@keystone-6/core/fields';
import {permissions} from '../access';
import {storeScopedFilter} from '../lib/storeAccess';
import {trackingFields} from './trackingFields';
export const CustomerMessage=list({access:{operation:{query:permissions.canManageOrders,create:()=>false,update:()=>false,delete:()=>false},filter:{query:storeScopedFilter}},fields:{
  store:relationship({ref:'Store'}),eventKey:text({isIndexed:'unique',validation:{isRequired:true}}),order:relationship({ref:'Order'}),user:relationship({ref:'User'}),
  recipient:text(),subject:text(),body:text(),channel:text({defaultValue:'email'}),status:text({defaultValue:'pending'}),attempts:integer({defaultValue:0}),
  providerEvidence:json(),failureMessage:text(),sentAt:timestamp(),deliveryToken:text({access:{read:()=>false}}),deliveryLeaseExpiresAt:timestamp({db:{isNullable:true}}),...trackingFields,
}});
