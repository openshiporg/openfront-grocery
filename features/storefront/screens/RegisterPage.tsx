import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '../lib/data/user';
import { storefrontMetadata } from '../lib/metadata';
import { shopperReturnPath } from '../lib/returnPath';
import { RegisterForm } from '../modules/account/RegisterForm';
import { ShopperAuthShell } from '../modules/account/auth/ShopperAuthShell';

export async function generateMetadata(): Promise<Metadata> {
  return storefrontMetadata({ title: 'Create an account', description: 'Create a shopper account to keep orders, lists, favorites and recurring baskets together.' });
}

export async function RegisterPage({ searchParams }: { searchParams?: Promise<{ from?: string }> }) {
  const params = searchParams ? await searchParams : {};
  // Shopper accounts return to the storefront, never into the staff dashboard.
  const from = shopperReturnPath(typeof params?.from === 'string' ? params.from : null);
  if (await getUser()) redirect(from);
  return <ShopperAuthShell active="register" from={from} title="Create an account" description="Keep your orders, shopping lists, favorites and recurring baskets in one place.">
    <RegisterForm from={from} />
  </ShopperAuthShell>;
}

export default RegisterPage;
