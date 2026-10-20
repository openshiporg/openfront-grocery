import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '../lib/data/user';
import { storefrontMetadata } from '../lib/metadata';
import { shopperReturnPath } from '../lib/returnPath';
import { ShopperAuthShell } from '../modules/account/auth/ShopperAuthShell';
import { ShopperSignInForm } from '../modules/account/auth/ShopperAuthForms';

export async function generateMetadata(): Promise<Metadata> {
  return storefrontMetadata({ title: 'Sign in', description: 'Sign in to your shopper account for orders, lists, favorites and alerts.' });
}

export function signInDescription(from: string) {
  if (from.startsWith('/products/')) return 'Sign in and we’ll bring you back to this product to set your alert or save it.';
  if (from.startsWith('/checkout') || from.startsWith('/cart')) return 'Sign in and we’ll bring you back to your basket. Your items stay put.';
  return 'See your orders, shopping lists, favorites and recurring baskets.';
}

export async function ShopperSignInPage({ searchParams }: { searchParams?: Promise<{ from?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const from = shopperReturnPath(typeof params?.from === 'string' ? params.from : null);
  if (await getUser()) redirect(from);
  return <ShopperAuthShell active="sign-in" from={from} title="Welcome back" description={signInDescription(from)}>
    <ShopperSignInForm from={from} />
  </ShopperAuthShell>;
}

export default ShopperSignInPage;
