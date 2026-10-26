-- =============================================================================
-- Nalam Care Medicals — COMPLETE DATABASE SCHEMA (single file)
--
-- Creates every table, sequence, index and constraint the app needs, plus the
-- shop settings row and the retail / wholesale dashboard settings.
--
-- Safe to run on a NEW, empty database and safe to RE-RUN on an existing one:
-- every statement uses IF NOT EXISTS / ON CONFLICT / guarded updates and
-- nothing is ever deleted.
--
-- Run it in the Neon SQL Editor, with psql, or:  node scripts/setup-db.mjs
--
-- Optional sample data:  npx tsx scripts/seed.ts
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Base tables
-- ---------------------------------------------------------------------------

-- Counters used for bill numbers (1, 2, 3 …) and customer IDs (NCM000001 …)
CREATE SEQUENCE IF NOT EXISTS "public"."bill_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS "public"."customer_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;

-- Tables
CREATE TABLE IF NOT EXISTS "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medicine_id" uuid NOT NULL,
	"supplier_id" uuid,
	"brand_name" text DEFAULT '' NOT NULL,
	"manufacturer" text DEFAULT '' NOT NULL,
	"invoice_no" text DEFAULT '' NOT NULL,
	"purchase_date" date NOT NULL,
	"batch_no" text NOT NULL,
	"mfg_date" text DEFAULT '' NOT NULL,
	"exp_date" text DEFAULT '' NOT NULL,
	"box" text DEFAULT '' NOT NULL,
	"purchase_unit_type" text NOT NULL,
	"pack_size" integer DEFAULT 1 NOT NULL,
	"qty_packs" integer DEFAULT 0 NOT NULL,
	"stock_added" integer DEFAULT 0 NOT NULL,
	"stock_qty" integer DEFAULT 0 NOT NULL,
	"purchase_rate" numeric(12, 2) DEFAULT '0' NOT NULL,
	"mrp" numeric(12, 2) DEFAULT '0' NOT NULL,
	"selling_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"gst_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "bill_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" text NOT NULL,
	"medicine_id" uuid,
	"batch_id" uuid,
	"generic_name" text NOT NULL,
	"brand_name" text DEFAULT '' NOT NULL,
	"manufacturer" text DEFAULT '' NOT NULL,
	"schedule" text NOT NULL,
	"hsn_code" text DEFAULT '' NOT NULL,
	"batch_no" text DEFAULT '' NOT NULL,
	"mfg_date" text DEFAULT '' NOT NULL,
	"exp_date" text DEFAULT '' NOT NULL,
	"box" text DEFAULT '' NOT NULL,
	"purchase_unit_type" text NOT NULL,
	"pack_size" integer DEFAULT 1 NOT NULL,
	"qty" integer NOT NULL,
	"mrp_per_unit" numeric(12, 2) NOT NULL,
	"per_unit_price" numeric(12, 2) NOT NULL,
	"line_mrp" numeric(12, 2) NOT NULL,
	"line_amount" numeric(12, 2) NOT NULL,
	"line_discount" numeric(12, 2) NOT NULL,
	"gst_percent" numeric(5, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS "bills" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"customer_name" text DEFAULT '' NOT NULL,
	"customer_phone" text DEFAULT '' NOT NULL,
	"customer_address" text DEFAULT '' NOT NULL,
	"doctor_name" text DEFAULT '' NOT NULL,
	"bill_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sub_total" numeric(12, 2) NOT NULL,
	"discount" numeric(12, 2) NOT NULL,
	"taxable_amount" numeric(12, 2) NOT NULL,
	"gst_amount" numeric(12, 2) NOT NULL,
	"gst_percent" numeric(5, 2) NOT NULL,
	"grand_total" numeric(12, 2) NOT NULL,
	"received_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"change_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payment_method" text NOT NULL,
	"status" text DEFAULT 'COMPLETED' NOT NULL
);

CREATE TABLE IF NOT EXISTS "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"doctor_name" text DEFAULT '' NOT NULL,
	"quick_bill" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "medicines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generic_name" text NOT NULL,
	"brand_name" text DEFAULT '' NOT NULL,
	"manufacturer" text DEFAULT '' NOT NULL,
	"salt" text DEFAULT '' NOT NULL,
	"schedule" text NOT NULL,
	"hsn_code" text DEFAULT '' NOT NULL,
	"gst_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"purchase_unit_type" text NOT NULL,
	"low_stock_threshold" integer DEFAULT 20 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"shop_name" text NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"address" text NOT NULL,
	"phone" text NOT NULL,
	"shop_contact_number" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"gstin" text NOT NULL,
	"dl_no" text NOT NULL,
	"colour_theme" text DEFAULT 'green' NOT NULL,
	"logo" text DEFAULT '' NOT NULL,
	"use_custom_logo" boolean DEFAULT false NOT NULL,
	"instagram_id" text DEFAULT '' NOT NULL,
	"default_gst" numeric(5, 2) DEFAULT '12' NOT NULL,
	"low_stock_threshold" integer DEFAULT 20 NOT NULL,
	"expiry_alert_months" integer DEFAULT 6 NOT NULL
);

CREATE TABLE IF NOT EXISTS "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Links between tables (added only if missing)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_medicine_id_medicines_id_fk') THEN
    ALTER TABLE "batches" ADD CONSTRAINT "batches_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_supplier_id_suppliers_id_fk') THEN
    ALTER TABLE "batches" ADD CONSTRAINT "batches_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bill_items_bill_id_bills_id_fk') THEN
    ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bills_customer_id_customers_id_fk') THEN
    ALTER TABLE "bills" ADD CONSTRAINT "bills_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "batches_medicine_idx" ON "batches" USING btree ("medicine_id");
CREATE INDEX IF NOT EXISTS "batches_exp_idx" ON "batches" USING btree ("exp_date");
CREATE INDEX IF NOT EXISTS "bill_items_bill_idx" ON "bill_items" USING btree ("bill_id");
CREATE INDEX IF NOT EXISTS "bills_created_idx" ON "bills" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "bills_customer_idx" ON "bills" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "medicines_generic_idx" ON "medicines" USING btree ("generic_name");

-- Shop settings (single row, id = 1).
-- GSTIN, DL No., owner name and Instagram ID are left empty until the owner
-- supplies them; set them in the app's Settings screen.
INSERT INTO "settings" (
  "id", "shop_name", "full_name", "address", "phone", "shop_contact_number", "email",
  "gstin", "dl_no", "colour_theme", "logo", "use_custom_logo", "instagram_id",
  "default_gst", "low_stock_threshold", "expiry_alert_months"
) VALUES (
  1, 'Nalam Care Medicals', '',
  'No. 18A/2B, Ground Floor, Old Township Road, Venkatapuram, Ambattur (OT), Chennai - 600053',
  '7305723203', '8122884066', 'sselvathurai00@gmail.com',
  '', '', 'nalam',
  '/logos/nalam-care-medicals-logo.png', false, '', '12', 20, 6
) ON CONFLICT ("id") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Customer & invoice details (email, age, gender, prescription, billed by, txn ref)
-- ---------------------------------------------------------------------------

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "email" text DEFAULT '' NOT NULL;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "age" text DEFAULT '' NOT NULL;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "gender" text DEFAULT '' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "customer_email" text DEFAULT '' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "customer_age" text DEFAULT '' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "customer_gender" text DEFAULT '' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "prescription_no" text DEFAULT '' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "billed_by" text DEFAULT '' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "txn_ref" text DEFAULT '' NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Retail & wholesale dashboards: modes, payments, returns, purchase orders, stock ledger, per-dashboard settings
-- ---------------------------------------------------------------------------

-- ---------- Sequences ----------
CREATE SEQUENCE IF NOT EXISTS "public"."wholesale_bill_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS "public"."purchase_order_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;

-- ---------- Shared catalogue ----------
ALTER TABLE "medicines" ADD COLUMN IF NOT EXISTS "barcode" text DEFAULT '' NOT NULL;
ALTER TABLE "medicines" ADD COLUMN IF NOT EXISTS "wholesale_moq" integer DEFAULT 0 NOT NULL;
ALTER TABLE "medicines" ADD COLUMN IF NOT EXISTS "archived" boolean DEFAULT false NOT NULL;

-- ---------- Mode on business records (NULL = legacy / unclassified) ----------
ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "mode" text;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "mode" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "mode" text;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "mode" text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_mode_check') THEN
    ALTER TABLE "batches" ADD CONSTRAINT "batches_mode_check" CHECK ("mode" IS NULL OR "mode" IN ('retail', 'wholesale'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bills_mode_check') THEN
    ALTER TABLE "bills" ADD CONSTRAINT "bills_mode_check" CHECK ("mode" IS NULL OR "mode" IN ('retail', 'wholesale'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_mode_check') THEN
    ALTER TABLE "customers" ADD CONSTRAINT "customers_mode_check" CHECK ("mode" IS NULL OR "mode" IN ('retail', 'wholesale'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_mode_check') THEN
    ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_mode_check" CHECK ("mode" IS NULL OR "mode" IN ('retail', 'wholesale'));
  END IF;
  -- Stock can never go below zero, whatever path writes it.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_stock_qty_nonneg') THEN
    ALTER TABLE "batches" ADD CONSTRAINT "batches_stock_qty_nonneg" CHECK ("stock_qty" >= 0) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "batches_mode_idx" ON "batches" USING btree ("mode");
CREATE INDEX IF NOT EXISTS "bills_mode_idx" ON "bills" USING btree ("mode");

-- ---------- Supplier details ----------
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "address" text DEFAULT '' NOT NULL;

-- ---------- Customer details (wholesale buyers, credit) ----------
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "business_type" text DEFAULT '' NOT NULL;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "gstin" text DEFAULT '' NOT NULL;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "shipping_address" text DEFAULT '' NOT NULL;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "credit_limit" numeric(12, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "credit_days" integer DEFAULT 0 NOT NULL;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL;

-- ---------- Bill payment / credit / returns ----------
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "due_amount" numeric(12, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "due_date" date;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "returned_amount" numeric(12, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "shipping_address" text DEFAULT '' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "customer_gstin" text DEFAULT '' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "client_ref" text;
CREATE UNIQUE INDEX IF NOT EXISTS "bills_client_ref_idx" ON "bills" USING btree ("client_ref");
-- Bills completed before this migration were settled at the counter: record them as paid.
UPDATE "bills" SET "paid_amount" = "grand_total" WHERE "paid_amount" = 0 AND "due_amount" = 0 AND "grand_total" > 0;

ALTER TABLE "bill_items" ADD COLUMN IF NOT EXISTS "cost_per_unit" numeric(12, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "bill_items" ADD COLUMN IF NOT EXISTS "returned_qty" integer DEFAULT 0 NOT NULL;

-- ---------- New tables ----------
CREATE TABLE IF NOT EXISTS "mode_settings" (
	"mode" text PRIMARY KEY NOT NULL,
	"invoice_prefix" text DEFAULT '' NOT NULL,
	"payment_methods" text DEFAULT 'Cash,UPI,Card' NOT NULL,
	"allow_credit" boolean DEFAULT false NOT NULL,
	"default_credit_days" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 0 NOT NULL,
	"expiry_alert_months" integer DEFAULT 0 NOT NULL,
	"max_discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"bulk_discount_tiers" text DEFAULT '[]' NOT NULL,
	"enforce_moq" boolean DEFAULT false NOT NULL,
	"invoice_terms" text DEFAULT '' NOT NULL,
	CONSTRAINT "mode_settings_mode_check" CHECK ("mode" IN ('retail', 'wholesale'))
);

-- Retail keeps the plain running bill numbers it has always printed.
INSERT INTO "mode_settings" ("mode", "invoice_prefix", "payment_methods", "allow_credit", "default_credit_days")
VALUES ('retail', '', 'Cash,UPI,Card', false, 0)
ON CONFLICT ("mode") DO NOTHING;
INSERT INTO "mode_settings" ("mode", "invoice_prefix", "payment_methods", "allow_credit", "default_credit_days", "enforce_moq")
VALUES ('wholesale', 'W', 'Cash,UPI,Card,Bank Transfer,Cheque,Credit', true, 30, true)
ON CONFLICT ("mode") DO NOTHING;

CREATE TABLE IF NOT EXISTS "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" text,
	"batch_id" uuid,
	"medicine_id" uuid,
	"type" text NOT NULL,
	"qty_change" integer DEFAULT 0 NOT NULL,
	"balance_after" integer DEFAULT 0 NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"actor" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "stock_movements_batch_idx" ON "stock_movements" USING btree ("batch_id");
CREATE INDEX IF NOT EXISTS "stock_movements_mode_idx" ON "stock_movements" USING btree ("mode");

CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" text NOT NULL,
	"party_type" text NOT NULL,
	"customer_id" text,
	"supplier_id" uuid,
	"bill_id" text,
	"invoice_no" text DEFAULT '' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" text DEFAULT 'Cash' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"paid_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_mode_check" CHECK ("mode" IN ('retail', 'wholesale')),
	CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0)
);
CREATE INDEX IF NOT EXISTS "payments_mode_idx" ON "payments" USING btree ("mode");

CREATE TABLE IF NOT EXISTS "sales_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" text NOT NULL,
	"bill_id" text NOT NULL,
	"customer_id" text,
	"items" text DEFAULT '[]' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"adjusted_against_due" numeric(12, 2) DEFAULT '0' NOT NULL,
	"refund_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"refund_method" text DEFAULT 'Cash' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_returns_mode_check" CHECK ("mode" IN ('retail', 'wholesale'))
);
CREATE INDEX IF NOT EXISTS "sales_returns_mode_idx" ON "sales_returns" USING btree ("mode");

CREATE TABLE IF NOT EXISTS "purchase_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" text NOT NULL,
	"supplier_id" uuid,
	"batch_id" uuid NOT NULL,
	"medicine_id" uuid,
	"generic_name" text DEFAULT '' NOT NULL,
	"batch_no" text DEFAULT '' NOT NULL,
	"qty" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_returns_mode_check" CHECK ("mode" IN ('retail', 'wholesale'))
);
CREATE INDEX IF NOT EXISTS "purchase_returns_mode_idx" ON "purchase_returns" USING btree ("mode");

CREATE TABLE IF NOT EXISTS "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" text NOT NULL,
	"po_no" text NOT NULL,
	"supplier_id" uuid,
	"order_date" date NOT NULL,
	"expected_date" date,
	"status" text DEFAULT 'ORDERED' NOT NULL,
	"items" text DEFAULT '[]' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_mode_check" CHECK ("mode" IN ('retail', 'wholesale'))
);
CREATE INDEX IF NOT EXISTS "purchase_orders_mode_idx" ON "purchase_orders" USING btree ("mode");

-- ---------------------------------------------------------------------------
-- 4. Shop details, logo and colour theme
-- ---------------------------------------------------------------------------

-- Fills in only what is still empty (or still the original default), so running
-- this file again never overwrites details changed in Settings.
UPDATE "settings" SET
  "shop_name" = CASE WHEN "shop_name" = '' THEN 'Nalam Care Medicals' ELSE "shop_name" END,
  "address" = CASE WHEN "address" = '' THEN 'No. 18A/2B, Ground Floor, Old Township Road, Venkatapuram, Ambattur (OT), Chennai - 600053' ELSE "address" END,
  "phone" = CASE WHEN "phone" = '' THEN '7305723203' ELSE "phone" END,
  "shop_contact_number" = CASE WHEN "shop_contact_number" = '' THEN '8122884066' ELSE "shop_contact_number" END,
  "email" = CASE WHEN "email" = '' THEN 'sselvathurai00@gmail.com' ELSE "email" END,
  "logo" = CASE WHEN "logo" = '' THEN '/logos/nalam-care-medicals-logo.png' ELSE "logo" END,
  "colour_theme" = CASE WHEN "colour_theme" IN ('', 'green', 'teal') THEN 'nalam' ELSE "colour_theme" END
WHERE "id" = 1;

-- ---------------------------------------------------------------------------
-- 5. User accounts — one login page, admin / staff roles, retail / wholesale access
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "app_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'staff' NOT NULL,
	"passcode_hash" text NOT NULL,
	"modes" text DEFAULT 'retail,wholesale' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_users_passcode_hash_unique" UNIQUE("passcode_hash"),
	CONSTRAINT "app_users_role_check" CHECK ("role" IN ('admin', 'staff'))
);

-- ---------------------------------------------------------------------------
-- 6. Separate GSTIN and drug licence number for Retail and Wholesale
-- ---------------------------------------------------------------------------

ALTER TABLE "mode_settings" ADD COLUMN IF NOT EXISTS "gstin" text DEFAULT '' NOT NULL;
ALTER TABLE "mode_settings" ADD COLUMN IF NOT EXISTS "dl_no" text DEFAULT '' NOT NULL;
UPDATE "mode_settings" m SET "gstin" = s."gstin"
FROM "settings" s WHERE s."id" = 1 AND m."gstin" = '' AND s."gstin" <> '';
UPDATE "mode_settings" m SET "dl_no" = s."dl_no"
FROM "settings" s WHERE s."id" = 1 AND m."dl_no" = '' AND s."dl_no" <> '';

-- ---------------------------------------------------------------------------
-- 7. Separate shop identity and stock & tax defaults for Retail and Wholesale
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 8. Shared supplier directory + stock transfers between Retail and Wholesale
-- ---------------------------------------------------------------------------

UPDATE "suppliers" SET "mode" = NULL WHERE "mode" IS NOT NULL;

ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "source_batch_id" uuid;
CREATE INDEX IF NOT EXISTS "batches_source_batch_idx" ON "batches" USING btree ("source_batch_id");

-- ---------------------------------------------------------------------------
-- 9. Automatic bill offers ("bill of ₹600 or more → 5% off"), per dashboard
-- ---------------------------------------------------------------------------

ALTER TABLE "mode_settings" ADD COLUMN IF NOT EXISTS "bill_offers" text DEFAULT '[]' NOT NULL;

-- ---------------------------------------------------------------------------
-- 10. Admin / staff login passcodes reset from Settings (hashed)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "login_passcodes" (
	"role" text PRIMARY KEY NOT NULL,
	"passcode_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_passcodes_role_check" CHECK ("role" IN ('admin', 'staff'))
);

-- ---------------------------------------------------------------------------
-- 11. Strips per box, so billing can sell by tablet, strip or box
-- ---------------------------------------------------------------------------

ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "strips_per_box" integer DEFAULT 0 NOT NULL;

-- ---------------------------------------------------------------------------
-- 12. Offer pop-up on customer invoice links (JSON, edited in Settings)
-- ---------------------------------------------------------------------------

ALTER TABLE "mode_settings" ADD COLUMN IF NOT EXISTS "invoice_promo" text DEFAULT '' NOT NULL;

-- ---------------------------------------------------------------------------
-- 13. Product types (Tablet, Injection, Cartridge…) on medicines and bill lines
-- ---------------------------------------------------------------------------

ALTER TABLE "medicines" ADD COLUMN IF NOT EXISTS "product_type" text DEFAULT '' NOT NULL;
ALTER TABLE "bill_items" ADD COLUMN IF NOT EXISTS "product_type" text DEFAULT '' NOT NULL;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "product_types" text DEFAULT '' NOT NULL;

-- ---------------------------------------------------------------------------
-- 14. Automatic product-type discounts (JSON bands per product type)
-- ---------------------------------------------------------------------------

ALTER TABLE "mode_settings" ADD COLUMN IF NOT EXISTS "type_discounts" text DEFAULT '[]' NOT NULL;

-- ---------------------------------------------------------------------------
-- 15. Purchase units list (Strip, Piece, Bottle + the shop's own)
-- ---------------------------------------------------------------------------

ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "purchase_units" text DEFAULT '' NOT NULL;

-- ---------------------------------------------------------------------------
-- 16. Distributor details on wholesale customers
-- ---------------------------------------------------------------------------

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "contact_person" text DEFAULT '' NOT NULL;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "dl_no" text DEFAULT '' NOT NULL;
