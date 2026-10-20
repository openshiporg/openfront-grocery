'use server';
import { storefrontGraphQL } from '../../lib/data/graphql';

export type ContactFormState = { status: 'idle' | 'sent' | 'error'; message: string; reference?: string; fields?: Record<string, string> };

const FIELDS = ['name', 'email', 'phone', 'topic', 'orderNumber', 'message'] as const;

/** Stores the message in the store's inbox. A filled honeypot gets the same reply without storing. */
export async function sendContactMessage(_previous: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const fields = Object.fromEntries(FIELDS.map((name) => [name, String(formData.get(name) || '').trim()])) as Record<(typeof FIELDS)[number], string>;
  if (String(formData.get('website') || '').trim()) return { status: 'sent', message: 'Your message was received by the store.', reference: 'JUN-RECEIVED' };
  try {
    const result = await storefrontGraphQL<{ submitGroceryContactMessage: { reference: string } }>(
      'mutation Contact($data: GroceryContactMessageInput!) { submitGroceryContactMessage(data: $data) { reference } }',
      { data: { ...fields, phone: fields.phone || null, orderNumber: fields.orderNumber || null, sourcePath: String(formData.get('from') || '/support').slice(0, 300) } },
      { cache: 'no-store' },
    );
    if (result.errors?.length) {
      const text = result.errors.map((error) => error.message || '').join(' ');
      return { status: 'error', message: /too many/i.test(text) ? 'You have sent several messages in a short time. Wait a minute, then try again.' : /unexpected/i.test(text) ? 'Your message could not be sent. Try again, or use the phone or email listed on this page.' : text, fields };
    }
    const reference = result.data?.submitGroceryContactMessage?.reference;
    if (!reference) return { status: 'error', message: 'Your message could not be sent. Try again, or use the phone or email listed on this page.', fields };
    return { status: 'sent', message: 'Your message was received by the store.', reference };
  } catch {
    return { status: 'error', message: 'Your message could not be sent. Check your connection and try again.', fields };
  }
}
