import type { Context } from '.keystone/types';

/**
 * Clip a coupon to the user's account
 *
 * This mutation allows a logged-in user to "clip" (save) a coupon to their account
 * for later use during checkout. It validates:
 * - User is logged in
 * - Coupon exists and is active
 * - Coupon is within valid date range
 * - Coupon hasn't exceeded max uses
 * - User hasn't already clipped this coupon
 */
export async function clipCoupon(
  root: any,
  { couponId, couponCode }: { couponId?: string; couponCode?: string },
  context: Context
) {
  // Require authentication
  if (!context.session?.itemId) {
    throw new Error('You must be logged in to clip a coupon');
  }

  const userId = context.session.itemId;
  const sudoContext = context.sudo();

  // Find the coupon by ID or code
  let coupon: any;

  if (couponId) {
    coupon = await sudoContext.query.Coupon.findOne({
      where: { id: couponId },
      query: `
        id
        code
        isActive
        validFrom
        validTo
        maxUses
        currentUses
        discountType
        discountValue
        minPurchase
        productCategories
      `,
    });
  } else if (couponCode) {
    const coupons = await sudoContext.query.Coupon.findMany({
      where: { code: { equals: couponCode } },
      query: `
        id
        code
        isActive
        validFrom
        validTo
        maxUses
        currentUses
        discountType
        discountValue
        minPurchase
        productCategories
      `,
    });
    coupon = coupons[0];
  } else {
    throw new Error('You must provide either a couponId or couponCode');
  }

  if (!coupon) {
    throw new Error('Coupon not found');
  }

  // Check if coupon is active
  if (!coupon.isActive) {
    throw new Error('This coupon is no longer active');
  }

  // Check date validity
  const now = new Date();

  if (coupon.validFrom && new Date(coupon.validFrom) > now) {
    throw new Error('This coupon is not yet valid');
  }

  if (coupon.validTo && new Date(coupon.validTo) < now) {
    throw new Error('This coupon has expired');
  }

  // Check max uses
  if (coupon.maxUses > 0 && coupon.currentUses >= coupon.maxUses) {
    throw new Error('This coupon has reached its maximum number of uses');
  }

  // Check if user already clipped this coupon
  const existingUserCoupons = await sudoContext.query.UserCoupon.findMany({
    where: {
      user: { id: { equals: userId } },
      coupon: { id: { equals: coupon.id } },
    },
    query: 'id used',
  });

  if (existingUserCoupons.length > 0) {
    const existing = existingUserCoupons[0];
    if (existing.used) {
      throw new Error('You have already used this coupon');
    }
    throw new Error('You have already clipped this coupon');
  }

  // Create the UserCoupon record
  const userCoupon = await sudoContext.query.UserCoupon.createOne({
    data: {
      user: { connect: { id: userId } },
      coupon: { connect: { id: coupon.id } },
      clippedAt: new Date().toISOString(),
      used: false,
    },
    query: `
      id
      clippedAt
      used
      coupon {
        id
        code
        discountType
        discountValue
        minPurchase
        validTo
        productCategories
      }
    `,
  });

  return {
    success: true,
    message: `Coupon "${coupon.code}" has been clipped to your account`,
    userCoupon: {
      id: userCoupon.id,
      clippedAt: userCoupon.clippedAt,
      coupon: {
        id: userCoupon.coupon.id,
        code: userCoupon.coupon.code,
        discountType: userCoupon.coupon.discountType,
        discountValue: userCoupon.coupon.discountValue,
        minPurchase: userCoupon.coupon.minPurchase,
        validTo: userCoupon.coupon.validTo,
        productCategories: userCoupon.coupon.productCategories,
      },
    },
  };
}

/**
 * Get all clipped coupons for the current user
 */
export async function getClippedCoupons(
  root: any,
  args: {},
  context: Context
) {
  if (!context.session?.itemId) {
    return [];
  }

  const sudoContext = context.sudo();

  const userCoupons = await sudoContext.query.UserCoupon.findMany({
    where: {
      user: { id: { equals: context.session.itemId } },
      used: { equals: false },
    },
    query: `
      id
      clippedAt
      coupon {
        id
        code
        discountType
        discountValue
        minPurchase
        validFrom
        validTo
        isActive
        productCategories
      }
    `,
  });

  // Filter out expired or inactive coupons
  const now = new Date();
  return userCoupons
    .filter((uc: any) => {
      const coupon = uc.coupon;
      if (!coupon.isActive) return false;
      if (coupon.validTo && new Date(coupon.validTo) < now) return false;
      return true;
    })
    .map((uc: any) => ({
      id: uc.id,
      clippedAt: uc.clippedAt,
      coupon: {
        id: uc.coupon.id,
        code: uc.coupon.code,
        discountType: uc.coupon.discountType,
        discountValue: uc.coupon.discountValue,
        minPurchase: uc.coupon.minPurchase,
        validTo: uc.coupon.validTo,
        productCategories: uc.coupon.productCategories,
      },
    }));
}

/**
 * Remove a clipped coupon from the user's account
 */
export async function unclipCoupon(
  root: any,
  { userCouponId }: { userCouponId: string },
  context: Context
) {
  if (!context.session?.itemId) {
    throw new Error('You must be logged in to unclip a coupon');
  }

  const sudoContext = context.sudo();

  // Find the user coupon
  const userCoupon = await sudoContext.query.UserCoupon.findOne({
    where: { id: userCouponId },
    query: `
      id
      used
      user { id }
      coupon { code }
    `,
  });

  if (!userCoupon) {
    throw new Error('Clipped coupon not found');
  }

  // Check ownership
  if (userCoupon.user.id !== context.session.itemId) {
    throw new Error('You can only remove your own clipped coupons');
  }

  // Cannot unclip used coupons
  if (userCoupon.used) {
    throw new Error('Cannot remove a coupon that has already been used');
  }

  // Delete the user coupon
  await sudoContext.query.UserCoupon.deleteOne({
    where: { id: userCouponId },
  });

  return {
    success: true,
    message: `Coupon "${userCoupon.coupon.code}" has been removed from your account`,
  };
}
