import { redirect } from 'next/navigation';

export function generateMetadata() {
  return { title: 'Products', description: 'Browse the grocery catalog.' };
}

/** Automated recurring orders are not offered in the bounded initial launch. */
export async function SubscriptionsPage() {
  redirect('/products');
}

export default SubscriptionsPage;
