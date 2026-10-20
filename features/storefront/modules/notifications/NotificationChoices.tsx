import { storefrontGraphQL, throwGraphQLErrors } from '@/features/storefront/lib/data/graphql';
import { NotificationChoicesForm } from './NotificationChoicesForm';
export async function NotificationChoices() {
  try {
    const response = await storefrontGraphQL<{ notificationPreferences: Array<{ orderUpdates: boolean; deliveryAlerts: boolean; backInStock: boolean; channels: unknown }> }>('query { notificationPreferences(take: 1, orderBy: [{ updatedAt: desc }]) { orderUpdates deliveryAlerts backInStock channels } }', {}, { cache: 'no-store' });
    throwGraphQLErrors(response.errors);
    if (!response.data) throw new Error('Preferences unavailable');
    return <NotificationChoicesForm preference={response.data.notificationPreferences[0]} />;
  } catch {
    return <section className="sf-panel space-y-3 p-5 sm:p-7"><h2 className="sf-subtitle">Email preferences</h2><p role="status" className="sf-copy">Your preferences couldn’t be loaded. Refresh this page to try again.</p></section>;
  }
}
