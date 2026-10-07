'use server';
import { revalidatePath } from 'next/cache';
import { GraphQLClient } from 'graphql-request';
import { getAuthHeaders } from '@/features/dashboard/lib/cookies';
import { getGraphQLEndpoint } from '@/features/dashboard/lib/getBaseUrl';
export async function recoverPaymentCreationAction(input: { paymentSessionId: string; providerPaymentId: string; reason: string }) {
  let response: any;
  try {
    // The generic dashboard client logs ClientError request variables. Provider
    // references belong only in this authenticated request and server evidence.
    const client = new GraphQLClient(await getGraphQLEndpoint(), { headers: await getAuthHeaders(), credentials: 'include' });
    response = await client.request(`mutation RecoverCreation($paymentSessionId: ID!, $providerPaymentId: String!, $reason: String!) {
      recoverGroceryPaymentCreation(paymentSessionId: $paymentSessionId, providerPaymentId: $providerPaymentId, reason: $reason)
    }`, input);
  } catch { throw new Error('Payment recovery could not complete. Check Store permissions and retry the same reference.'); }
  revalidatePath('/dashboard/platform/payments');
  return response.recoverGroceryPaymentCreation;
}
