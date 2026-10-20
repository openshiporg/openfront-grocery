'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { storefrontGraphQL } from '../../../lib/data/graphql';
import { GUEST_CART_COOKIE } from '../../../lib/data/cart';
import { shopperReturnPath } from '../../../lib/returnPath';
import { SHOPPER_EMAIL_MAX, shopperPasswordProblem } from '../../../../lib/accountContract';

// Shopper accounts live in the storefront (E-commerce account @login pattern). These actions use the
// storefront GraphQL client, which never logs request variables, and the same Keystone auth
// mutations and session cookie as the dashboard. Returned form state never contains a password.

export type ShopperAuthState = { message: string | null; success?: string | null; email: string };
export type ShopperRegisterState = {
  message: string | null;
  formData: { name?: string; email: string; password: string };
  /** The account exists but automatic sign-in did not complete; continue by signing in. */
  created?: boolean;
};
export type ShopperPasswordState = { message: string | null; success?: string | null };

const SESSION_COOKIE = 'keystonejs-session';
const RESET_RETURN_COOKIE = 'grocery_reset_return';
const UNAVAILABLE = 'Sign-in is not available right now. Try again in a moment.';

async function startSession(sessionToken: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionToken, { secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', httpOnly: true, maxAge: 60 * 60 * 24 * 30 });
  revalidatePath('/', 'layout');
}

/** Run a storefront GraphQL request; a network or non-JSON failure becomes `null` instead of a page error. */
async function attempt<T>(query: string, variables: Record<string, unknown>, headers?: HeadersInit) {
  try {
    return await storefrontGraphQL<T>(query, variables, { cache: 'no-store', headers });
  } catch {
    return null;
  }
}

async function authenticate(email: string, password: string) {
  const result = await attempt<{ authenticate?: { sessionToken?: string; message?: string } }>(`
    mutation($email: String!, $password: String!) {
      authenticate: authenticateUserWithPassword(email: $email, password: $password) {
        ... on UserAuthenticationWithPasswordSuccess { sessionToken }
        ... on UserAuthenticationWithPasswordFailure { message }
      }
    }
  `, { email, password });
  return { failed: !result || Boolean(result.errors?.length), sessionToken: result?.data?.authenticate?.sessionToken || null };
}

/**
 * Move this browser's guest basket into the account that just signed in. The guest cookie is
 * removed only after the server confirms the merge; on any failure it stays so the basket
 * provider can retry and show the shopper what happened. A repeated merge is harmless.
 */
async function mergeGuestBasket(sessionToken: string) {
  const cookieStore = await cookies();
  const guestSessionId = cookieStore.get(GUEST_CART_COOKIE)?.value;
  if (!guestSessionId) return;
  const result = await attempt<{ mergeGuestGroceryCart?: { id: string } | null }>(
    'mutation($guestSessionId: String!) { mergeGuestGroceryCart(guestSessionId: $guestSessionId) { id } }',
    { guestSessionId },
    { Cookie: `${SESSION_COOKIE}=${sessionToken}` },
  );
  if (result && !result.errors?.length && result.data?.mergeGuestGroceryCart?.id) cookieStore.delete(GUEST_CART_COOKIE);
}

function firstMessage(errors?: Array<{ message?: string }>) {
  const message = errors?.map((error) => error.message || '').find(Boolean) || '';
  return /unexpected/i.test(message) ? '' : message;
}

function boundedEmail(value: FormDataEntryValue | null) {
  return String(value || '').trim().slice(0, SHOPPER_EMAIL_MAX + 1);
}

/** Storefront sign-in. */
export async function signInShopper(_previous: ShopperAuthState, formData: FormData): Promise<ShopperAuthState> {
  const email = boundedEmail(formData.get('email'));
  const password = String(formData.get('password') || '');
  const from = shopperReturnPath(String(formData.get('from') || ''));
  if (!email || !password) return { message: 'Enter your email and password.', email };
  if (email.length > SHOPPER_EMAIL_MAX) return { message: `Enter an email address of up to ${SHOPPER_EMAIL_MAX} characters.`, email: '' };
  const { failed, sessionToken } = await authenticate(email, password);
  if (failed) return { message: UNAVAILABLE, email };
  if (!sessionToken) return { message: 'That email and password don’t match an account. Check them, or reset your password.', email };
  await mergeGuestBasket(sessionToken);
  await startSession(sessionToken);
  redirect(from);
}

/** Storefront account creation: register the shopper, sign them in and return them to the shop. */
export async function registerShopper(_previous: ShopperRegisterState, formData: FormData): Promise<ShopperRegisterState> {
  const name = String(formData.get('name') || '').trim();
  const email = boundedEmail(formData.get('email'));
  const password = String(formData.get('password') || '');
  const from = shopperReturnPath(String(formData.get('from') || ''));
  const keep = { name, email, password: '' };
  if (!name) return { message: 'Enter your name.', formData: keep };
  if (email.length > SHOPPER_EMAIL_MAX) return { message: `Enter an email address of up to ${SHOPPER_EMAIL_MAX} characters.`, formData: { ...keep, email: '' } };
  const passwordProblem = shopperPasswordProblem(password);
  if (passwordProblem) return { message: passwordProblem, formData: keep };
  if (password !== String(formData.get('confirmPassword') ?? password)) return { message: 'The two passwords do not match.', formData: keep };
  const registered = await attempt<{ registerGroceryCustomer?: { success: boolean } }>(
    'mutation($name: String!, $email: String!, $password: String!) { registerGroceryCustomer(name: $name, email: $email, password: $password) { success } }',
    { name, email, password },
  );
  if (!registered) {
    // The request may or may not have reached the store: say so, rather than inviting a duplicate.
    return { message: 'We couldn’t confirm whether your account was created. Try signing in with this email first; if that doesn’t work, try again.', formData: keep };
  }
  if (registered.errors?.length || !registered.data?.registerGroceryCustomer?.success) {
    return { message: firstMessage(registered.errors) || 'Your account could not be created. Try again.', formData: keep };
  }
  const { sessionToken } = await authenticate(email, password);
  if (!sessionToken) return { message: null, created: true, formData: keep };
  await mergeGuestBasket(sessionToken);
  await startSession(sessionToken);
  redirect(from);
}

/** Storefront sign-out: end the shopper session and return to the shop. */
export async function signOutShopper() {
  await attempt('mutation { endSession }', {});
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  revalidatePath('/', 'layout');
  redirect('/');
}

const RESET_UNAVAILABLE = 'Password reset by email is not available right now. Contact the store for help signing in.';

/** Request a reset link; the email links shoppers back to /account/reset. */
export async function requestShopperPasswordReset(_previous: ShopperAuthState, formData: FormData): Promise<ShopperAuthState> {
  const email = boundedEmail(formData.get('email'));
  if (!email) return { message: 'Enter your account email.', email };
  if (email.length > SHOPPER_EMAIL_MAX) return { message: `Enter an email address of up to ${SHOPPER_EMAIL_MAX} characters.`, email: '' };
  // Without a mail service no link can reach anyone, so say so for every address alike.
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return { message: RESET_UNAVAILABLE, email };
  const result = await attempt<{ sendUserPasswordResetLink?: boolean }>('mutation($email: String!) { sendUserPasswordResetLink(email: $email) }', { email });
  if (!result) return { message: 'The reset link could not be requested. Check your connection and try again.', email };
  if (result.errors?.length || result.data?.sendUserPasswordResetLink !== true) {
    return { message: firstMessage(result.errors) || 'The reset link could not be sent. Try again later or contact the store.', email };
  }
  // Remember where the shopper was going, for this browser only, so signing in after the reset
  // returns them there (checkout, a stock alert, a list).
  const from = shopperReturnPath(String(formData.get('from') || ''), '');
  const cookieStore = await cookies();
  if (from) cookieStore.set(RESET_RETURN_COOKIE, from, { secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/account', httpOnly: true, maxAge: 60 * 60 });
  return { message: null, success: 'If an account exists for this email, a password reset link is on its way.', email };
}

/** The validated storefront destination remembered when the reset was requested in this browser. */
export async function rememberedResetReturnPath() {
  const cookieStore = await cookies();
  return shopperReturnPath(cookieStore.get(RESET_RETURN_COOKIE)?.value || '', '');
}

/** Redeem the emailed token and set a new password. */
export async function completeShopperPasswordReset(_previous: ShopperAuthState, formData: FormData): Promise<ShopperAuthState> {
  const email = boundedEmail(formData.get('email'));
  const password = String(formData.get('password') || '');
  const token = String(formData.get('token') || '');
  const passwordProblem = shopperPasswordProblem(password);
  if (passwordProblem) return { message: passwordProblem, email };
  if (password !== String(formData.get('confirmPassword') ?? password)) return { message: 'The two passwords do not match.', email };
  const result = await attempt<{ redeemUserPasswordResetToken?: { code: string; message: string } | null }>(
    'mutation($email: String!, $token: String!, $password: String!) { redeemUserPasswordResetToken(email: $email, token: $token, password: $password) { code message } }',
    { email, token, password },
  );
  if (!result) return { message: 'We couldn’t confirm the reset. Try the link again, or request a new one.', email };
  if (result.errors?.length) return { message: firstMessage(result.errors) || 'Your password could not be reset. Request a new link.', email };
  if (result.data?.redeemUserPasswordResetToken?.code) return { message: result.data.redeemUserPasswordResetToken.message || 'This reset link is invalid or has expired. Request a new one.', email };
  return { message: null, success: 'Password has been reset. You can now sign in.', email };
}

/** Signed-in password change: the current password is verified by the store before the new one is saved. */
export async function changeShopperPassword(_previous: ShopperPasswordState, formData: FormData): Promise<ShopperPasswordState> {
  const currentPassword = String(formData.get('currentPassword') || '');
  const newPassword = String(formData.get('newPassword') || '');
  if (!currentPassword) return { message: 'Enter your current password.' };
  const passwordProblem = shopperPasswordProblem(newPassword);
  if (passwordProblem) return { message: passwordProblem };
  if (newPassword !== String(formData.get('confirmPassword') ?? '')) return { message: 'The two new passwords do not match.' };
  const result = await attempt<{ updateActiveUserPassword?: boolean }>(
    'mutation($currentPassword: String!, $newPassword: String!) { updateActiveUserPassword(currentPassword: $currentPassword, newPassword: $newPassword) }',
    { currentPassword, newPassword },
  );
  if (!result) return { message: 'We couldn’t confirm the change. Check your connection, then try signing in with your new password before trying again.' };
  if (result.errors?.length || result.data?.updateActiveUserPassword !== true) {
    return { message: firstMessage(result.errors) || 'Your password could not be changed. Try again.' };
  }
  return { message: null, success: 'Your password has been changed.' };
}
