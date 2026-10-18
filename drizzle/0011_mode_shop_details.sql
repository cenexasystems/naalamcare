-- =============================================================================
-- Separate shop identity and stock & tax defaults for Retail and Wholesale.
-- Each mode starts with a copy of the current shop-wide details; after that
-- they are edited independently in Settings → Shop Details. Logo, colour
-- theme and Instagram stay shared. Additive and safe to re-run.
-- =============================================================================
ALTER TABLE "mode_settings" ADD COLUMN IF NOT EXISTS "shop_name" text DEFAULT '' NOT NULL;
ALTER TABLE "mode_settings" ADD COLUMN IF NOT EXISTS "full_name" text DEFAULT '' NOT NULL;
ALTER TABLE "mode_settings" ADD COLUMN IF NOT EXISTS "address" text DEFAULT '' NOT NULL;
ALTER TABLE "mode_settings" ADD COLUMN IF NOT EXISTS "phone" text DEFAULT '' NOT NULL;
ALTER TABLE "mode_settings" ADD COLUMN IF NOT EXISTS "shop_contact_number" text DEFAULT '' NOT NULL;
ALTER TABLE "mode_settings" ADD COLUMN IF NOT EXISTS "email" text DEFAULT '' NOT NULL;
ALTER TABLE "mode_settings" ADD COLUMN IF NOT EXISTS "default_gst" numeric(5, 2) DEFAULT '12' NOT NULL;

-- First run only (a mode with no shop name yet): start from the shop-wide details.
UPDATE "mode_settings" m SET
  "shop_name" = s."shop_name",
  "full_name" = s."full_name",
  "address" = s."address",
  "phone" = s."phone",
  "shop_contact_number" = s."shop_contact_number",
  "email" = s."email",
  "default_gst" = s."default_gst",
  "expiry_alert_months" = CASE WHEN m."expiry_alert_months" = 0 THEN s."expiry_alert_months" ELSE m."expiry_alert_months" END
FROM "settings" s
WHERE s."id" = 1 AND m."shop_name" = '';
