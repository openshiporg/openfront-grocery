import type { Context } from '.keystone/types';

// Types for coupon application
interface CouponBreakdownItem {
  couponId: string;
  couponCode: string;
  discountType: string;
  discountAmount: number;
  appliedToProducts: string[];
}

interface ApplyCouponsResult {
  success: boolean;
  totalDiscount: number;
  breakdown: CouponBreakdownItem[];
  warnings: string[];
  finalSubtotal: number;
}

interface CartItemWithProduct {
  id: string;
  quantity: number;
  subtotal: number;
  product: {
    id: string;
    title: string;
    price: number;
    department: string | null;
  };
}

/**
 * Apply clipped coupons to the user's cart at checkout
 *
 * This mutation:
 * 1. Retrieves all clipped (unused) coupons for the user
 * 2. Validates each coupon against the cart contents
 * 3. Calculates discounts based on coupon types (percentage, fixed, BOGO)
 * 4. Handles stacking rules (some coupons may not stack)
 * 5. Returns total discount and breakdown by coupon
 */
export async function applyCoupons(
  root: any,
  {
    userCouponIds,
    sessionId,
  }: { userCouponIds?: string[]; sessionId?: string },
  context: Context
): Promise<ApplyCouponsResult> {
  // Require authentication for applying coupons
  if (!context.session?.itemId) {
    throw new Error('You must be logged in to apply coupons');
  }

  const userId = context.session.itemId;
  const sudoContext = context.sudo();

  // Get the user's cart
  const carts = await sudoContext.query.Cart.findMany({
    where: {
      customer: { id: { equals: userId } },
    },
    query: `
      id
      subtotal
      items {
        id
        quantity
        subtotal
        product {
          id
          title
          price
          department
        }
      }
    `,
  });

  if (carts.length === 0 || carts[0].items.length === 0) {
    return {
      success: false,
      totalDiscount: 0,
      breakdown: [],
      warnings: ['Your cart is empty'],
      finalSubtotal: 0,
    };
  }

  const cart = carts[0];
  const cartItems: CartItemWithProduct[] = cart.items;
  const originalSubtotal = cart.subtotal || 0;

  // Get user's clipped coupons
  let userCouponsQuery: any = {
    user: { id: { equals: userId } },
    used: { equals: false },
  };

  // If specific coupon IDs provided, filter to those
  if (userCouponIds && userCouponIds.length > 0) {
    userCouponsQuery.id = { in: userCouponIds };
  }

  const userCoupons = await sudoContext.query.UserCoupon.findMany({
    where: userCouponsQuery,
    query: `
      id
      coupon {
        id
        code
        discountType
        discountValue
        minPurchase
        validFrom
        validTo
        isActive
        maxUses
        currentUses
        productCategories
        excludedProducts
      }
    `,
  });

  if (userCoupons.length === 0) {
    return {
      success: true,
      totalDiscount: 0,
      breakdown: [],
      warnings: ['No clipped coupons to apply'],
      finalSubtotal: originalSubtotal,
    };
  }

  const breakdown: CouponBreakdownItem[] = [];
  const warnings: string[] = [];
  let totalDiscount = 0;

  // Track which products have had discounts applied (for stacking rules)
  const discountedProducts = new Set<string>();

  // Track if a percentage/fixed coupon has been applied (for stacking rules)
  let hasPercentageOrFixedApplied = false;

  // Process each coupon
  for (const userCoupon of userCoupons) {
    const coupon = userCoupon.coupon;

    // Validate coupon is still valid
    const now = new Date();

    if (!coupon.isActive) {
      warnings.push(`Coupon "${coupon.code}" is no longer active`);
      continue;
    }

    if (coupon.validFrom && new Date(coupon.validFrom) > now) {
      warnings.push(`Coupon "${coupon.code}" is not yet valid`);
      continue;
    }

    if (coupon.validTo && new Date(coupon.validTo) < now) {
      warnings.push(`Coupon "${coupon.code}" has expired`);
      continue;
    }

    if (coupon.maxUses > 0 && coupon.currentUses >= coupon.maxUses) {
      warnings.push(`Coupon "${coupon.code}" has reached its maximum uses`);
      continue;
    }

    // Check minimum purchase requirement
    if (coupon.minPurchase && originalSubtotal < coupon.minPurchase) {
      warnings.push(
        `Coupon "${coupon.code}" requires minimum purchase of $${coupon.minPurchase.toFixed(2)}`
      );
      continue;
    }

    // Stacking rule: Only one percentage/fixed coupon allowed
    if (
      (coupon.discountType === 'percentage' || coupon.discountType === 'fixed') &&
      hasPercentageOrFixedApplied
    ) {
      warnings.push(
        `Coupon "${coupon.code}" cannot be stacked with other percentage/fixed discounts`
      );
      continue;
    }

    // Find applicable products for this coupon
    const applicableItems = getApplicableItems(cartItems, coupon);

    if (applicableItems.length === 0) {
      warnings.push(
        `Coupon "${coupon.code}" does not apply to any items in your cart`
      );
      continue;
    }

    // Calculate discount based on type
    let discountAmount = 0;
    const appliedToProducts: string[] = [];

    switch (coupon.discountType) {
      case 'percentage':
        discountAmount = calculatePercentageDiscount(
          applicableItems,
          coupon.discountValue,
          discountedProducts
        );
        applicableItems.forEach((item) => {
          appliedToProducts.push(item.product.id);
          discountedProducts.add(item.product.id);
        });
        hasPercentageOrFixedApplied = true;
        break;

      case 'fixed':
        // Fixed discount applies to the total of applicable items
        const applicableTotal = applicableItems.reduce(
          (sum, item) => sum + item.subtotal,
          0
        );
        discountAmount = Math.min(coupon.discountValue, applicableTotal);
        applicableItems.forEach((item) => {
          appliedToProducts.push(item.product.id);
          discountedProducts.add(item.product.id);
        });
        hasPercentageOrFixedApplied = true;
        break;

      case 'bogo':
        // Buy One Get One: Find pairs and apply discount to the cheaper item
        discountAmount = calculateBOGODiscount(
          applicableItems,
          discountedProducts
        );
        applicableItems.forEach((item) => {
          if (item.quantity >= 2 || applicableItems.length >= 2) {
            appliedToProducts.push(item.product.id);
            discountedProducts.add(item.product.id);
          }
        });
        break;

      default:
        warnings.push(`Unknown discount type for coupon "${coupon.code}"`);
        continue;
    }

    if (discountAmount > 0) {
      breakdown.push({
        couponId: coupon.id,
        couponCode: coupon.code,
        discountType: coupon.discountType,
        discountAmount: Math.round(discountAmount * 100) / 100,
        appliedToProducts,
      });
      totalDiscount += discountAmount;
    } else {
      warnings.push(
        `Coupon "${coupon.code}" did not provide any discount for your cart`
      );
    }
  }

  // Ensure discount doesn't exceed subtotal
  totalDiscount = Math.min(totalDiscount, originalSubtotal);
  totalDiscount = Math.round(totalDiscount * 100) / 100;

  const finalSubtotal = Math.round((originalSubtotal - totalDiscount) * 100) / 100;

  return {
    success: true,
    totalDiscount,
    breakdown,
    warnings,
    finalSubtotal,
  };
}

/**
 * Get cart items that are applicable for a given coupon
 */
function getApplicableItems(
  cartItems: CartItemWithProduct[],
  coupon: any
): CartItemWithProduct[] {
  let applicable = [...cartItems];

  // Filter by product categories if specified
  const productCategories = coupon.productCategories;
  if (productCategories && Array.isArray(productCategories) && productCategories.length > 0) {
    applicable = applicable.filter((item) =>
      productCategories.includes(item.product.department)
    );
  }

  // Exclude specific products if specified
  const excludedProducts = coupon.excludedProducts;
  if (excludedProducts && Array.isArray(excludedProducts) && excludedProducts.length > 0) {
    applicable = applicable.filter(
      (item) => !excludedProducts.includes(item.product.id)
    );
  }

  return applicable;
}

/**
 * Calculate percentage discount for applicable items
 */
function calculatePercentageDiscount(
  items: CartItemWithProduct[],
  percentage: number,
  alreadyDiscounted: Set<string>
): number {
  let total = 0;

  for (const item of items) {
    // Skip if this product already has a discount (stacking rule)
    if (alreadyDiscounted.has(item.product.id)) {
      continue;
    }

    const itemDiscount = item.subtotal * (percentage / 100);
    total += itemDiscount;
  }

  return total;
}

/**
 * Calculate BOGO (Buy One Get One) discount
 *
 * For each pair of items, the cheaper one is free.
 * If a single product has quantity >= 2, apply to itself.
 * Otherwise, pair up different products by price.
 */
function calculateBOGODiscount(
  items: CartItemWithProduct[],
  alreadyDiscounted: Set<string>
): number {
  let totalDiscount = 0;

  // Filter out already discounted items
  const eligibleItems = items.filter(
    (item) => !alreadyDiscounted.has(item.product.id)
  );

  if (eligibleItems.length === 0) {
    return 0;
  }

  // First, handle items with quantity >= 2 (BOGO on same product)
  for (const item of eligibleItems) {
    if (item.quantity >= 2) {
      // Every second item is free
      const freeItems = Math.floor(item.quantity / 2);
      const itemPrice = item.product.price || 0;
      totalDiscount += freeItems * itemPrice;
    }
  }

  // For items with quantity 1, pair them up with other single items
  const singleItems = eligibleItems
    .filter((item) => item.quantity === 1)
    .sort((a, b) => (b.product.price || 0) - (a.product.price || 0));

  // Pair items: for every 2 items, the cheaper one is free
  for (let i = 0; i < singleItems.length - 1; i += 2) {
    const cheaperItem = singleItems[i + 1];
    totalDiscount += cheaperItem.product.price || 0;
  }

  return totalDiscount;
}

/**
 * Mark coupons as used after successful checkout
 * Call this after the order is placed successfully
 */
export async function markCouponsAsUsed(
  root: any,
  { userCouponIds }: { userCouponIds: string[] },
  context: Context
) {
  if (!context.session?.itemId) {
    throw new Error('You must be logged in');
  }

  const sudoContext = context.sudo();
  const now = new Date().toISOString();

  const results = [];

  for (const userCouponId of userCouponIds) {
    // Verify ownership
    const userCoupon = await sudoContext.query.UserCoupon.findOne({
      where: { id: userCouponId },
      query: `
        id
        used
        user { id }
        coupon { id currentUses }
      `,
    });

    if (!userCoupon || userCoupon.user.id !== context.session.itemId) {
      continue;
    }

    if (userCoupon.used) {
      continue;
    }

    // Mark as used
    await sudoContext.query.UserCoupon.updateOne({
      where: { id: userCouponId },
      data: {
        used: true,
        usedAt: now,
      },
    });

    // Increment coupon usage count
    await sudoContext.query.Coupon.updateOne({
      where: { id: userCoupon.coupon.id },
      data: {
        currentUses: (userCoupon.coupon.currentUses || 0) + 1,
      },
    });

    results.push(userCouponId);
  }

  return {
    success: true,
    markedAsUsed: results,
  };
}

/**
 * Preview coupon application without actually applying
 * Useful for showing potential savings before checkout
 */
export async function previewCouponDiscount(
  root: any,
  { couponCode, sessionId }: { couponCode: string; sessionId?: string },
  context: Context
) {
  const sudoContext = context.sudo();

  // Find the coupon
  const coupons = await sudoContext.query.Coupon.findMany({
    where: { code: { equals: couponCode } },
    query: `
      id
      code
      discountType
      discountValue
      minPurchase
      validFrom
      validTo
      isActive
      productCategories
    `,
  });

  if (coupons.length === 0) {
    return {
      valid: false,
      message: 'Coupon not found',
      potentialDiscount: 0,
    };
  }

  const coupon = coupons[0];

  // Validate coupon
  const now = new Date();

  if (!coupon.isActive) {
    return {
      valid: false,
      message: 'This coupon is no longer active',
      potentialDiscount: 0,
    };
  }

  if (coupon.validTo && new Date(coupon.validTo) < now) {
    return {
      valid: false,
      message: 'This coupon has expired',
      potentialDiscount: 0,
    };
  }

  // Get cart (works for both logged-in and guest users)
  let cart: any;

  if (context.session?.itemId) {
    const carts = await sudoContext.query.Cart.findMany({
      where: {
        customer: { id: { equals: context.session.itemId } },
      },
      query: `
        id
        subtotal
        items {
          id
          quantity
          subtotal
          product {
            id
            title
            price
            department
          }
        }
      `,
    });
    cart = carts[0];
  } else if (sessionId) {
    const carts = await sudoContext.query.Cart.findMany({
      where: {
        sessionId: { equals: sessionId },
      },
      query: `
        id
        subtotal
        items {
          id
          quantity
          subtotal
          product {
            id
            title
            price
            department
          }
        }
      `,
    });
    cart = carts[0];
  }

  if (!cart || cart.items.length === 0) {
    return {
      valid: true,
      message: 'Add items to your cart to see potential savings',
      potentialDiscount: 0,
      couponDetails: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minPurchase: coupon.minPurchase,
      },
    };
  }

  // Check minimum purchase
  if (coupon.minPurchase && cart.subtotal < coupon.minPurchase) {
    return {
      valid: true,
      message: `Add $${(coupon.minPurchase - cart.subtotal).toFixed(2)} more to use this coupon`,
      potentialDiscount: 0,
      couponDetails: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minPurchase: coupon.minPurchase,
      },
    };
  }

  // Calculate potential discount
  const applicableItems = getApplicableItems(cart.items, coupon);
  let potentialDiscount = 0;

  switch (coupon.discountType) {
    case 'percentage':
      potentialDiscount = calculatePercentageDiscount(
        applicableItems,
        coupon.discountValue,
        new Set()
      );
      break;
    case 'fixed':
      const applicableTotal = applicableItems.reduce(
        (sum: number, item: any) => sum + item.subtotal,
        0
      );
      potentialDiscount = Math.min(coupon.discountValue, applicableTotal);
      break;
    case 'bogo':
      potentialDiscount = calculateBOGODiscount(applicableItems, new Set());
      break;
  }

  potentialDiscount = Math.round(potentialDiscount * 100) / 100;

  return {
    valid: true,
    message: potentialDiscount > 0
      ? `You could save $${potentialDiscount.toFixed(2)} with this coupon!`
      : 'This coupon does not apply to items in your cart',
    potentialDiscount,
    couponDetails: {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minPurchase: coupon.minPurchase,
    },
  };
}
