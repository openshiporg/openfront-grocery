import type { GroceryPlatformOrder } from '@/features/platform/lib/platformProjections';

type PickedSale = {
  status: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
  actuals: unknown[];
};

export function orderFinancialDisplay(order: GroceryPlatformOrder) {
  const sale = (order.metadata as Record<string, unknown> | null)?.finalSale as PickedSale | undefined;
  const validSale = sale
    && ['processing', 'requires_customer_authorization', 'finalized'].includes(sale.status)
    && Array.isArray(sale.actuals)
    && [sale.subtotalCents, sale.discountCents, sale.taxCents, sale.feeCents, sale.totalCents]
      .every(value => Number.isSafeInteger(value) && value >= 0);

  if (!validSale) return {
    stage: 'estimate' as const,
    title: 'Checkout estimate',
    checkoutEstimateCents: order.totalCents,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    taxCents: order.taxCents,
    deliveryFeeCents: order.deliveryFeeCents,
    totalCents: order.totalCents,
  };

  const stage = sale.status === 'finalized' ? 'finalized' as const
    : sale.status === 'requires_customer_authorization' ? 'authorization' as const
      : 'settlement' as const;
  return {
    stage,
    title: stage === 'finalized' ? 'Final picked sale'
      : stage === 'authorization' ? 'Picked sale · customer authorization required'
        : 'Picked sale · settlement pending',
    checkoutEstimateCents: order.totalCents,
    subtotalCents: sale.subtotalCents,
    discountCents: sale.discountCents,
    taxCents: sale.taxCents,
    deliveryFeeCents: sale.feeCents,
    totalCents: sale.totalCents,
  };
}
