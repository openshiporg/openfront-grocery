import { storefrontMetadata } from '@/features/storefront/lib/metadata';
import OrderAccess from '@/features/storefront/modules/order-access/OrderAccess';
export const metadata = storefrontMetadata({ title: 'Find your order', description: 'Get a secure link to a guest order by email.' });
export default OrderAccess;
