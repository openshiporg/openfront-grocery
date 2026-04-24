import type { Context } from '.keystone/types';
import { createPayment } from '../utils/paymentProviderAdapter';

interface InitiatePaymentSessionArgs {
  cartId: string;
  paymentProviderId: string;
}

export default async function initiatePaymentSession(
  root: any,
  { cartId, paymentProviderId }: InitiatePaymentSessionArgs,
  context: Context
) {
  const sudoContext = context.sudo();

  const cart = await sudoContext.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id
      subtotal
      taxRate: subtotal
      paymentSessions {
        id
        isSelected
        isInitiated
        amount
        paymentProvider {
          id
          code
        }
        data
      }
    `,
  });

  if (!cart) {
    throw new Error('Cart not found');
  }

  const provider = await sudoContext.query.PaymentProvider.findOne({
    where: { code: paymentProviderId },
    query: `
      id
      code
      isInstalled
      createPaymentFunction
      capturePaymentFunction
      refundPaymentFunction
      getPaymentStatusFunction
      generatePaymentLinkFunction
      handleWebhookFunction
      credentials
    `,
  });

  if (!provider || !provider.isInstalled) {
    throw new Error(`Payment provider ${paymentProviderId} not found or not installed`);
  }

  const amount = Number(cart.subtotal || 0);
  const existingSession = cart.paymentSessions?.find((session: any) => session.paymentProvider?.code === provider.code);

  if (existingSession) {
    return existingSession;
  }

  const sessionData = await createPayment({
    provider,
    cart,
    amount,
    currency: 'usd',
  });

  const newSession = await sudoContext.query.PaymentSession.createOne({
    data: {
      cart: { connect: { id: cart.id } },
      paymentProvider: { connect: { id: provider.id } },
      amount: amount.toFixed(2),
      isSelected: true,
      isInitiated: true,
      data: sessionData,
    },
    query: `
      id
      data
      amount
      isInitiated
      isSelected
      paymentProvider {
        id
        code
      }
    `,
  });

  return newSession;
}
