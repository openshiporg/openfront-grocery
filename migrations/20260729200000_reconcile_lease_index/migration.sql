-- The reconciliation query is bounded and uses the attempt row CAS; keep schema ownership in Keystone/Prisma without an unrepresented compound index.
DROP INDEX IF EXISTS "CheckoutAttempt_reconciliation_lease_idx";
