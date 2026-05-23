import type { Context } from '.keystone/types';
import { getPaymentStatus } from '../utils/paymentProviderAdapter';

type SubmitOrderArgs = {
  data: {
    cartId: string;
    paymentSessionId: string;
    paymentIntentId: string;
    sessionId?: string | null;
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
    fulfillmentMethod: 'delivery' | 'pickup';
    deliverySlotId?: string | null;
    pickupSlotId?: string | null;
    deliveryFee: number;
    expectedTotal: number;
    substitutionPreference: string;
    deliveryInstructions?: string | null;
  };
};

const TAX_RATE = 0.0875;

function generateDisplayId() {
  return Number(String(Date.now()).slice(-6));
}

export default async function submitGroceryOrder(
  root: unknown,
  { data }: SubmitOrderArgs,
  context: Context
) {
  const sudoContext = context.sudo();
  const fulfillmentMethod = data.fulfillmentMethod === 'pickup' ? 'pickup' : 'delivery';

  if (fulfillmentMethod === 'delivery' && !data.deliverySlotId) {
    throw new Error('Delivery orders require a delivery slot');
  }

  if (fulfillmentMethod === 'pickup' && !data.pickupSlotId) {
    throw new Error('Pickup orders require a pickup slot');
  }

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
        substitutionPreference
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

  if (sessionUserId) {
    if (cartOwnerId !== sessionUserId) {
      throw new Error('You do not have access to this cart');
    }
  } else if (!data.sessionId?.trim() || cartOwnerId || cart.sessionId !== data.sessionId.trim()) {
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

  const deliverySlot = fulfillmentMethod === 'delivery'
    ? await sudoContext.query.DeliverySlot.findOne({
        where: { id: data.deliverySlotId as string },
        query: 'id date startTime endTime capacity currentBookings isActive deliveryFee',
      })
    : null;

  const pickupSlot = fulfillmentMethod === 'pickup'
    ? await sudoContext.query.PickupSlot.findOne({
        where: { id: data.pickupSlotId as string },
        query: 'id date startTime endTime maxOrders currentOrders isAvailable',
      })
    : null;

  if (fulfillmentMethod === 'delivery' && !deliverySlot) {
    throw new Error('Selected delivery slot was not found');
  }

  if (fulfillmentMethod === 'pickup' && !pickupSlot) {
    throw new Error('Selected pickup slot was not found');
  }

  if (deliverySlot && !deliverySlot.isActive) {
    throw new Error('Selected delivery slot is no longer available');
  }

  if (pickupSlot && !pickupSlot.isAvailable) {
    throw new Error('Selected pickup slot is no longer available');
  }

  if (deliverySlot && deliverySlot.capacity - deliverySlot.currentBookings <= 0) {
    throw new Error('Selected delivery slot is fully booked');
  }

  if (pickupSlot && pickupSlot.maxOrders - pickupSlot.currentOrders <= 0) {
    throw new Error('Selected pickup slot is fully booked');
  }

  const subtotal = cart.items.reduce((sum: number, item: any) => sum + ((item.product?.price || 0) * item.quantity), 0);
  const taxAmount = Number((subtotal * TAX_RATE).toFixed(2));
  const deliveryFee = fulfillmentMethod === 'delivery' ? Number(((deliverySlot?.deliveryFee || 0) / 100).toFixed(2)) : 0;
  const orderTotal = Number((subtotal + taxAmount + deliveryFee).toFixed(2));

  if (Math.abs(orderTotal - data.expectedTotal) > 0.02) {
    throw new Error('Order total changed before checkout. Please review your cart and fulfillment slot.');
  }

  if (Math.abs(deliveryFee - data.deliveryFee) > 0.02) {
    throw new Error('Delivery fee changed before checkout. Please review your fulfillment slot.');
  }

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

  if ((selectedSession.data?.fulfillmentMethod || fulfillmentMethod) !== fulfillmentMethod) {
    throw new Error('Payment session fulfillment method does not match checkout');
  }

  if (fulfillmentMethod === 'delivery' && selectedSession.data?.deliverySlotId !== data.deliverySlotId) {
    throw new Error('Payment session delivery slot does not match checkout delivery slot');
  }

  if (fulfillmentMethod === 'pickup' && selectedSession.data?.pickupSlotId !== data.pickupSlotId) {
    throw new Error('Payment session pickup slot does not match checkout pickup slot');
  }

  const sessionTotal = Number(selectedSession.data?.total || selectedSession.amount || 0);
  if (Math.abs(sessionTotal - orderTotal) > 0.02) {
    throw new Error('Payment session amount does not match order total');
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

  const address = await sudoContext.db.Address.createOne({
    data: {
      firstName: data.deliveryAddress.firstName,
      lastName: data.deliveryAddress.lastName,
      address1: fulfillmentMethod === 'pickup' ? 'Curbside pickup' : data.deliveryAddress.address1,
      city: fulfillmentMethod === 'pickup' ? 'Store pickup' : data.deliveryAddress.city,
      province: fulfillmentMethod === 'pickup' ? 'N/A' : data.deliveryAddress.province,
      postalCode: fulfillmentMethod === 'pickup' ? 'N/A' : data.deliveryAddress.postalCode,
      phone: data.deliveryAddress.phone,
      user: sessionUserId ? { connect: { id: sessionUserId } } : undefined,
    },
  });

  const selectedSlot = deliverySlot || pickupSlot;
  const order = await sudoContext.db.Order.createOne({
    data: {
      displayId: generateDisplayId(),
      email: data.email,
      status: 'pending',
      taxRate: TAX_RATE,
      deliveryDate: new Date(data.deliveryDate).toISOString(),
      deliveryTimeWindow: data.deliveryTimeWindow as any,
      substitutionPreference: data.substitutionPreference as any,
      deliveryInstructions: data.deliveryInstructions || undefined,
      metadata: {
        fulfillmentMethod,
        deliverySlotId: data.deliverySlotId || null,
        pickupSlotId: data.pickupSlotId || null,
        deliveryFee,
        subtotal,
        taxAmount,
        orderTotal,
        selectedFulfillmentSlot: selectedSlot
          ? {
              date: selectedSlot.date,
              startTime: selectedSlot.startTime,
              endTime: selectedSlot.endTime,
            }
          : null,
      },
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
        metadata: {
          cartItemId: item.id,
          substitutionPreference: item.substitutionPreference || null,
        },
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

  if (deliverySlot && data.deliverySlotId) {
    await sudoContext.query.DeliverySlot.updateOne({
      where: { id: data.deliverySlotId },
      data: {
        currentBookings: deliverySlot.currentBookings + 1,
        isActive: deliverySlot.currentBookings + 1 < deliverySlot.capacity,
      },
    });
  }

  if (pickupSlot && data.pickupSlotId) {
    await sudoContext.query.PickupSlot.updateOne({
      where: { id: data.pickupSlotId },
      data: {
        currentOrders: pickupSlot.currentOrders + 1,
        isAvailable: pickupSlot.currentOrders + 1 < pickupSlot.maxOrders,
      },
    });
  }

  await sudoContext.db.Payment.createOne({
    data: {
      amount: orderTotal.toFixed(2),
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
