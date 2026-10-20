import type { Metadata } from 'next';
import { storefrontMetadata } from '../lib/metadata';
import { ShopperAuthShell } from '../modules/account/auth/ShopperAuthShell';
import { ShopperResetCompleteForm, ShopperResetRequestForm } from '../modules/account/auth/ShopperAuthForms';
import { rememberedResetReturnPath } from '../modules/account/auth/actions';
import { shopperReturnPath } from '../lib/returnPath';

export async function generateMetadata(): Promise<Metadata> {
  return storefrontMetadata({ title: 'Reset your password', description: 'Reset the password for your shopper account.' });
}

export async function ShopperResetPage({ searchParams }: { searchParams?: Promise<{ token?: string; from?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const token = typeof params?.token === 'string' && params.token.length <= 500 ? params.token : null;
  // The shopper's destination survives the reset: from the link while requesting, and from the
  // remembered (validated) path when the emailed link is opened in the same browser.
  const from = token ? await rememberedResetReturnPath() : shopperReturnPath(typeof params?.from === 'string' ? params.from : '', '');
  return token
    ? <ShopperAuthShell active="reset" title="Choose a new password" description="Enter the email for your account and a new password.">
      <ShopperResetCompleteForm token={token} from={from || undefined} />
    </ShopperAuthShell>
    : <ShopperAuthShell active="reset" title="Reset your password" description="Enter your account email and we’ll send a link to choose a new password.">
      <ShopperResetRequestForm from={from || undefined} />
    </ShopperAuthShell>;
}

export default ShopperResetPage;
