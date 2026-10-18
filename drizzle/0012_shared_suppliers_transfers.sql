-- =============================================================================
-- Shared supplier directory + explicit stock transfers between Retail and
-- Wholesale. Additive and safe to re-run.
--
-- • Suppliers: one directory for both modes. The old per-mode tag is cleared
--   (purchases, payments, returns and balances keep their own mode).
-- • Transfers: a transferred batch points at the batch it came from, keeping
--   batch number, expiry and purchase cost traceable.
-- =============================================================================
UPDATE "suppliers" SET "mode" = NULL WHERE "mode" IS NOT NULL;

ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "source_batch_id" uuid;
CREATE INDEX IF NOT EXISTS "batches_source_batch_idx" ON "batches" USING btree ("source_batch_id");
