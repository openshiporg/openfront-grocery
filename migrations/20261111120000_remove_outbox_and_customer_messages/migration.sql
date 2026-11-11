-- Remove the invented outbox and customer-message machinery. External events go through
-- Openfront Commerce webhooks only. Only these two tables are dropped.
DROP TABLE IF EXISTS "GroceryOutboxEvent";
DROP TABLE IF EXISTS "CustomerMessage";
