-- Round-2 invariants: floors and bounds the app's writers already respect, now held
-- by the database so no future writer (or raw admin edit) can break them.
-- NOT VALID: every new write is checked; existing rows were verified clean
-- (0 violations on production, 2026-11-08) and are not rescanned mid-deploy.

-- Stock never goes negative; a lot never holds more than it was received with.
ALTER TABLE "Product" ADD CONSTRAINT "Product_stockQuantity_nonnegative" CHECK ("stockQuantity" IS NULL OR "stockQuantity" >= 0) NOT VALID;
ALTER TABLE "Product" ADD CONSTRAINT "Product_money_nonnegative" CHECK ("priceCents" >= 0 AND "costPriceCents" >= 0) NOT VALID;
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_quantity_bounds" CHECK ("quantity" > 0 AND "quantityRemaining" >= 0 AND "quantityRemaining" <= "quantity") NOT VALID;

-- Slot capacity: bookings stay within 0..capacity, and a window ends after it starts.
ALTER TABLE "DeliverySlot" ADD CONSTRAINT "DeliverySlot_bookings_within_capacity" CHECK ("capacity" >= 1 AND COALESCE("currentBookings", 0) >= 0 AND COALESCE("currentBookings", 0) <= "capacity" AND COALESCE("deliveryFee", 0) >= 0) NOT VALID;
ALTER TABLE "DeliverySlot" ADD CONSTRAINT "DeliverySlot_window_order" CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" > "startTime") NOT VALID;
ALTER TABLE "PickupSlot" ADD CONSTRAINT "PickupSlot_orders_within_capacity" CHECK ("maxOrders" >= 1 AND COALESCE("currentOrders", 0) >= 0 AND COALESCE("currentOrders", 0) <= "maxOrders") NOT VALID;
ALTER TABLE "PickupSlot" ADD CONSTRAINT "PickupSlot_window_order" CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" > "startTime") NOT VALID;

-- Coupons: usage within the cap, sane values, and a validity window that ends after it starts.
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_uses_within_max" CHECK (COALESCE("currentUses", 0) >= 0 AND COALESCE("maxUses", 0) >= 0 AND (COALESCE("maxUses", 0) = 0 OR COALESCE("currentUses", 0) <= "maxUses")) NOT VALID;
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_value_bounds" CHECK ("discountValueCents" >= 0 AND "minPurchaseCents" >= 0 AND COALESCE("discountValue", 0) >= 0 AND ("discountType" <> 'percentage' OR COALESCE("discountValue", 0) <= 100)) NOT VALID;
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_valid_window" CHECK ("validFrom" IS NULL OR "validTo" IS NULL OR "validTo" > "validFrom") NOT VALID;

-- Money and quantity floors on the ledgers and baskets.
ALTER TABLE "Order" ADD CONSTRAINT "Order_money_nonnegative" CHECK ("subtotalCents" >= 0 AND "taxCents" >= 0 AND "deliveryFeeCents" >= 0 AND "discountCents" >= 0 AND "totalCents" >= 0) NOT VALID;
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_amount_positive" CHECK ("amountCents" > 0) NOT VALID;
ALTER TABLE "OrderLineRefund" ADD CONSTRAINT "OrderLineRefund_quantity_positive" CHECK ("quantityMilli" > 0) NOT VALID;
-- (No balance floor: refund clawback may leave loyalty debt by design; redemption checks the balance under the account lock.)
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_balance_arithmetic" CHECK ("balanceBefore" IS NULL OR "balanceBefore" + "points" = "balanceAfter") NOT VALID;
ALTER TABLE "LoyaltyRedemption" ADD CONSTRAINT "LoyaltyRedemption_positive" CHECK ("points" > 0 AND "discountCents" >= 0) NOT VALID;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_quantity_positive" CHECK ("quantity" >= 1) NOT VALID;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_quantity_positive" CHECK ("quantity" >= 1) NOT VALID;

-- One of each per customer: the mutations dedupe under advisory locks, but the
-- generic create path did not, and nothing below the app held it.
CREATE UNIQUE INDEX "FavoriteProduct_user_product_key" ON "FavoriteProduct" ("user", "productRef") WHERE "productRef" IS NOT NULL;
CREATE UNIQUE INDEX "BackInStockAlert_active_user_product_key" ON "BackInStockAlert" ("user", "productRef") WHERE "isActive" AND "productRef" IS NOT NULL;
CREATE UNIQUE INDEX "UserCoupon_open_clip_key" ON "UserCoupon" ("user", "coupon") WHERE NOT "used";
CREATE UNIQUE INDEX "NotificationPreference_user_key" ON "NotificationPreference" ("user");
CREATE UNIQUE INDEX "SubstitutionPreference_user_key" ON "SubstitutionPreference" ("user");
-- Rolling generation and onboarding key slots by store/day/window; two rows for one window split capacity.
CREATE UNIQUE INDEX "DeliverySlot_store_window_key" ON "DeliverySlot" ("store", "date", "startTime", "endTime");
CREATE UNIQUE INDEX "PickupSlot_store_window_key" ON "PickupSlot" ("store", "date", "startTime", "endTime");
