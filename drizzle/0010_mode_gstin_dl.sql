-- =============================================================================
-- Separate GSTIN and drug licence number for Retail and Wholesale.
-- Any shop-wide values already entered are copied into both modes (only where
-- a mode has none yet). Additive and safe to re-run.
-- =============================================================================
ALTER TABLE "mode_settings" ADD COLUMN IF NOT EXISTS "gstin" text DEFAULT '' NOT NULL;
ALTER TABLE "mode_settings" ADD COLUMN IF NOT EXISTS "dl_no" text DEFAULT '' NOT NULL;
UPDATE "mode_settings" m SET "gstin" = s."gstin"
FROM "settings" s WHERE s."id" = 1 AND m."gstin" = '' AND s."gstin" <> '';
UPDATE "mode_settings" m SET "dl_no" = s."dl_no"
FROM "settings" s WHERE s."id" = 1 AND m."dl_no" = '' AND s."dl_no" <> '';
