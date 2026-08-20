import type { GroceryOrder } from '../../types';

function mapOrderStatus(status: string): GroceryOrder['status'] {
  const statusMap: Record<string, GroceryOrder['status']> = {
    pending: 'pending',
    confirmed: 'confirmed',
    processing: 'processing',
    picking: 'picking',
    packed: 'processing',
    picked: 'picking',
    ready_for_pickup: 'ready_for_pickup',
    out_for_delivery: 'out_for_delivery',
    shipped: 'out_for_delivery',
    delivered: 'delivered',
    completed: 'delivered',
    cancelled: 'cancelled',
    canceled: 'cancelled',
  };
  return statusMap[status?.toLowerCase()] || 'pending';
}

function mapSubstitutionPreference(pref: string): 'allow' | 'contact' | 'remove' {
  const prefMap: Record<string, 'allow' | 'contact' | 'remove'> = {
    best_match: 'allow',
    allow: 'allow',
    call_me: 'contact',
    contact: 'contact',
    refund: 'remove',
    remove: 'remove',
  };
  return prefMap[pref?.toLowerCase()] || 'allow';
}

function mapLineItems(lineItems: any[] = [], substitutions: any[] = []) {
  const substitutionByItem = new Map(
    substitutions.map((substitution) => [substitution.orderItem, substitution])
  );

  return lineItems.map((item: any) => {
    const substitution = substitutionByItem.get(item.id) || item.metadata?.substitution;

    return {
      id: item.id,
      title: item.title,
      variant: undefined,
      quantity: item.quantity,
      unit_price: Math.round((item.unitPrice || 0) * 100),
      thumbnail: item.thumbnail,
      product: item.product
        ? {
            id: item.product.id,
            handle: item.product.handle,
          }
        : undefined,
      substitutionPreference: item.metadata?.substitutionPreference || null,
      substitution: substitution
        ? {
            id: substitution.id,
            originalProduct: substitution.originalProduct,
            substitutedProduct: substitution.substitutedProduct,
            reason: substitution.reason,
            customerApproved: Boolean(substitution.customerApproved),
            approvedAt: substitution.approvedAt,
          }
        : undefined,
    };
  });
}

export function mapStorefrontOrder(order: any): GroceryOrder {
  const items = mapLineItems(order.lineItems || [], order.orderItemSubstitutions || []);
  const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const metadata = order.metadata || {};
  const authoritativeSubtotal = Number(metadata.subtotalCents ?? subtotal);
  const taxTotal = Number(metadata.taxCents ?? Math.round(authoritativeSubtotal * (order.taxRate || 0)));
  const shippingTotal = Number(metadata.deliveryFeeCents ?? Math.round((metadata.deliveryFee || 0) * 100));
  const discountTotal = Number(metadata.discountCents || 0);
  const total = Number(metadata.totalCents ?? Math.max(0, authoritativeSubtotal + taxTotal + shippingTotal - discountTotal));
  const fulfillmentSlot = metadata.selectedFulfillmentSlot;
  const fulfillmentMethod = metadata.fulfillmentMethod === 'pickup' ? 'pickup' : 'delivery';
  const pickupReady = fulfillmentMethod === 'pickup' && Boolean(metadata.readyForPickup);

  return {
    id: order.id,
    orderNumber: String(order.displayId || order.id.slice(-8).toUpperCase()),
    status: pickupReady && order.status === 'packed' ? 'ready_for_pickup' : mapOrderStatus(order.status),
    email: order.email,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    subtotal: authoritativeSubtotal,
    tax_total: taxTotal,
    shipping_total: shippingTotal,
    discount_total: discountTotal,
    total,
    shippingAddress: order.shippingAddress,
    fulfillmentMethod,
    deliverySlot: order.deliveryDate
      ? {
          date: new Date(order.deliveryDate).toISOString(),
          startTime:
            fulfillmentSlot?.startTime ||
            (order.deliveryTimeWindow?.startsWith('time_8')
              ? '08:00'
              : order.deliveryTimeWindow?.startsWith('time_10')
              ? '10:00'
              : order.deliveryTimeWindow?.startsWith('time_12')
              ? '12:00'
              : order.deliveryTimeWindow?.startsWith('time_14')
              ? '14:00'
              : order.deliveryTimeWindow?.startsWith('time_16')
              ? '16:00'
              : '18:00'),
          endTime:
            fulfillmentSlot?.endTime ||
            (order.deliveryTimeWindow?.endsWith('10')
              ? '10:00'
              : order.deliveryTimeWindow?.endsWith('12')
              ? '12:00'
              : order.deliveryTimeWindow?.endsWith('14')
              ? '14:00'
              : order.deliveryTimeWindow?.endsWith('16')
              ? '16:00'
              : order.deliveryTimeWindow?.endsWith('18')
              ? '18:00'
              : '20:00'),
        }
      : undefined,
    pickupCheckIn:
      fulfillmentMethod === 'pickup'
        ? {
            customerArrived: Boolean(metadata.customerArrived),
            checkInTime: metadata.checkInTime || null,
            parkingSpotId: metadata.parkingSpotId || null,
            parkingSpotNumber: metadata.parkingSpotNumber || null,
            vehicleDescription: metadata.vehicleDescription || null,
          }
        : undefined,
    deliveryInstructions: order.deliveryInstructions,
    substitutionPreference: mapSubstitutionPreference(order.substitutionPreference),
    items,
  };
}
