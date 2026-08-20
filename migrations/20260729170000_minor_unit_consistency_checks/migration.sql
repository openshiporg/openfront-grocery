ALTER TABLE "Product" ADD CONSTRAINT "Product_priceCents_matches_price" CHECK ("priceCents" = ROUND("price"::numeric * 100)::INTEGER);
ALTER TABLE "Product" ADD CONSTRAINT "Product_costPriceCents_matches_costPrice" CHECK ("costPriceCents" = ROUND("costPrice"::numeric * 100)::INTEGER);
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_subtotalCents_matches_subtotal" CHECK ("subtotalCents" = ROUND("subtotal"::numeric * 100)::INTEGER);
ALTER TABLE "OrderLineItem" ADD CONSTRAINT "OrderLineItem_unitPriceCents_matches_unitPrice" CHECK ("unitPriceCents" = ROUND("unitPrice"::numeric * 100)::INTEGER);
ALTER TABLE "Order" ADD CONSTRAINT "Order_totalCents_matches_components" CHECK ("totalCents" = "subtotalCents" + "taxCents" + "deliveryFeeCents" - "discountCents");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amountCents_matches_amount" CHECK ("amountCents" = ROUND("amount"::numeric * 100)::INTEGER);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_deliveryTipCents_matches_tip" CHECK ("deliveryTipCents" = ROUND(COALESCE("deliveryTipAmount", 0)::numeric * 100)::INTEGER);
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_amountCents_matches_amount" CHECK ("amountCents" = ROUND("amount"::numeric * 100)::INTEGER);
