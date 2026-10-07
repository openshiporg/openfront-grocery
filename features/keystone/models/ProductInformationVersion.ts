import {list} from '@keystone-6/core';
import {json,relationship,text,timestamp} from '@keystone-6/core/fields';
import {permissions} from '../access';
import {storeScopedFilter} from '../lib/storeAccess';
import {trackingFields} from './trackingFields';
export const ProductInformationVersion=list({access:{operation:{query:permissions.canManageProducts,create:()=>false,update:()=>false,delete:()=>false},filter:{query:storeScopedFilter}},fields:{store:relationship({ref:'Store'}),product:relationship({ref:'Product'}),actor:relationship({ref:'User'}),idempotencyKey:text({isIndexed:'unique'}),sourceReference:text(),effectiveAt:timestamp(),snapshot:json(),...trackingFields}});
