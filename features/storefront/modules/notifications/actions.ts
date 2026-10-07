 'use server';
import {storefrontGraphQL,throwGraphQLErrors} from '@/features/storefront/lib/data/graphql';
import {revalidatePath} from 'next/cache';
export async function saveNotificationChoices(form:FormData) {
  const data={orderUpdates:form.get('orderUpdates')==='on',deliveryAlerts:form.get('deliveryAlerts')==='on',backInStock:form.get('backInStock')==='on'};
  const saved=await storefrontGraphQL('mutation($orderUpdates:Boolean!,$deliveryAlerts:Boolean!,$backInStock:Boolean!){updateGroceryNotificationPreferences(orderUpdates:$orderUpdates,deliveryAlerts:$deliveryAlerts,backInStock:$backInStock)}',data,{cache:'no-store'});throwGraphQLErrors(saved.errors);
  if(saved.data?.updateGroceryNotificationPreferences !== true) throw new Error('Preferences could not be saved. Please try again.');
  revalidatePath('/account');
  revalidatePath('/account/profile');
}
