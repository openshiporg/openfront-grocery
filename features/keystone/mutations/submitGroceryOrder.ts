import type { Context } from '.keystone/types';
import { getPaymentStatus } from '../utils/paymentProviderAdapter';

type SubmitOrderArgs = {
  data: {
    cartId: string;
    paymentSessionId: string;
    paymentIntentId: string;
    email: string;
    deliveryAddress: {
      firstName: string;
      lastName: string;
      address1: string;
      city: string;
      province: string;
      postalCode: string;
      phone: string;
    };
    deliveryDate: string;
    deliveryTimeWindow: string;
    substitutionPreference: string;
    deliveryInstructions?: string | null;
  };
};

function generateDisplayId() {
  return Number(String(Date.now()).slice(-6));
}

export default async function submitGroceryOrder(
  root: unknown,
  { data }: SubmitOrderArgs,
  context: Context
) {
  const sudoContext = context.sudo();

  const cart = await sudoContext.query.Cart.findOne({
    where: { id: data.cartId },
    query: `
      id
      sessionId
      customer { id }
      items {
        id
        quantity
        subtotal
        product {
          id
          title
          sku
          price
          imageUrl
          inStock
          stockQuantity
        }
      }
    `,
  });

  if (!cart) {
    throw new Error('Cart not found');
  }

  const sessionUserId = context.session?.itemId || null;
  const cartOwnerId = cart.customer?.id || null;

  if (cartOwnerId && sessionUserId && cartOwnerId !== sessionUserId) {
    throw new Error('You do not have access to this cart');
  }

  if (!cart.items?.length) {
    throw new Error('Cart is empty');
  }

  for (const item of cart.items) {
    if (!item.product) {
      throw new Error('Cart contains an invalid product');
    }
    if (!item.product.inStock) {
      throw new Error(`${item.product.title} is out of stock`);
    }
    if (
      item.product.stockQuantity !== null &&
      item.product.stockQuantity !== undefined &&
      item.product.stockQuantity < item.quantity
    ) {
      throw new Error(`Only ${item.product.stockQuantity} units available for ${item.product.title}`);
    }
  }

  const address = await sudoContext.db.Address.createOne({
    data: {
      firstName: data.deliveryAddress.firstName,
      lastName: data.deliveryAddress.lastName,
      address1: data.deliveryAddress.address1,
      city: data.deliveryAddress.city,
      province: data.deliveryAddress.province,
      postalCode: data.deliveryAddress.postalCode,
      phone: data.deliveryAddress.phone,
      user: sessionUserId ? { connect: { id: sessionUserId } } : undefined,
    },
  });

  const selectedSession = await sudoContext.query.PaymentSession.findOne({
    where: { id: data.paymentSessionId },
    query: `
      id
      amount
      isSelected
      isInitiated
      data
      paymentProvider {
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
      }
      cart {
        id
      }
    `,
  });

  if (!selectedSession || selectedSession.cart?.id !== cart.id) {
    throw new Error('Selected payment session not found for this cart');
  }

  const paymentProvider = selectedSession.paymentProvider;
  if (!paymentProvider) {
    throw new Error('Payment provider missing from payment session');
  }

  const providerPaymentId = selectedSession.data?.paymentIntentId || data.paymentIntentId;
  if (!providerPaymentId) {
    throw new Error('Payment session is missing provider payment id');
  }

  const paymentStatus = await getPaymentStatus({
    provider: paymentProvider,
    paymentId: providerPaymentId,
  });

  const normalizedStatus = paymentStatus?.status || 'succeeded';
  if (!['succeeded', 'requires_capture', 'captured', 'processing'].includes(normalizedStatus)) {
    throw new Error(`Payment is not in a chargeable state: ${normalizedStatus}`);
  }

  const order = await sudoContext.db.Order.createOne({
    data: {
      displayId: generateDisplayId(),
      email: data.email,
      status: 'pending',
      taxRate: 0.0875,
      deliveryDate: new Date(data.deliveryDate).toISOString(),
      deliveryTimeWindow: data.deliveryTimeWindow as any,
      substitutionPreference: data.substitutionPreference as any,
      deliveryInstructions: data.deliveryInstructions || undefined,
      user: sessionUserId ? { connect: { id: sessionUserId } } : undefined,
      shippingAddress: { connect: { id: address.id } },
    },
  });

  for (const item of cart.items) {
    await sudoContext.db.OrderLineItem.createOne({
      data: {
        title: item.product?.title || 'Product',
        sku: item.product?.sku || undefined,
        quantity: item.quantity,
        unitPrice: item.product?.price || 0,
        thumbnail: item.product?.imageUrl || undefined,
        order: { connect: { id: order.id } },
        product: item.product?.id ? { connect: { id: item.product.id } } : undefined,
      },
    });

    if (item.product?.id && typeof item.product.stockQuantity === 'number') {
      await sudoContext.db.Product.updateOne({
        where: { id: item.product.id },
        data: {
          stockQuantity: Math.max(0, item.product.stockQuantity - item.quantity),
          inStock: item.product.stockQuantity - item.quantity > 0,
        },
      });
    }
  }

  const subtotal = cart.items.reduce((sum: number, item: any) => sum + ((item.product?.price || 0) * item.quantity), 0);
  const paymentAmount = subtotal * (1 + 0.0875);

  await sudoContext.db.Payment.createOne({
    data: {
      amount: paymentAmount.toFixed(2),
      status: 'succeeded',
      paymentMethod: 'credit_card',
      providerPaymentId,
      providerData: {
        ...selectedSession.data,
        status: paymentStatus?.status,
        providerCode: paymentProvider.code,
      },
      processedAt: new Date().toISOString(),
      order: { connect: { id: order.id } },
      paymentProvider: { connect: { id: paymentProvider.id } },
      processedBy: sessionUserId ? { connect: { id: sessionUserId } } : undefined,
    },
  });

  for (const item of cart.items) {
    await sudoContext.db.CartItem.deleteOne({
      where: { id: item.id },
    });
  }

  await sudoContext.db.Cart.updateOne({
    where: { id: cart.id },
    data: {
      itemCount: 0,
      subtotal: 0,
    },
  });

  return {
    success: true,
    orderId: order.id,
    displayId: order.displayId,
    message: 'Order submitted successfully',
  };
}
