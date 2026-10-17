-- =============================================================================
-- Nalam Care Medicals — Retail & Wholesale split
--
-- Additive and safe to re-run. Nothing is deleted and no existing stock, bill,
-- customer or supplier is assigned to a mode: legacy rows keep mode = NULL and
-- are listed under Settings → Reconciliation for an admin to classify.
-- =============================================================================

-- ---------- Sequences ----------
CREATE SEQUENCE IF NOT EXISTS "public"."wholesale_bill_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "public"."purchase_order_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint

-- ---------- Shared catalogue ----------
ALTER TABLE "medicines" ADD COLUMN IF NOT EXISTS "barcode" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "medicines" ADD COLUMN IF NOT EXISTS "wholesale_moq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "medicines" ADD COLUMN IF NOT EXISTS "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- ---------- Mode on business records (NULL = legacy / unclassified) ----------
ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "mode" text;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "mode" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "mode" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "mode" text;--> statement-breakpoint

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
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "batches_mode_idx" ON "batches" USING btree ("mode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bills_mode_idx" ON "bills" USING btree ("mode");--> statement-breakpoint

-- ---------- Supplier details ----------
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "address" text DEFAULT '' NOT NULL;--> statement-breakpoint

-- ---------- Customer details (wholesale buyers, credit) ----------
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "business_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "gstin" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "shipping_address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "credit_limit" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "credit_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint

-- ---------- Bill payment / credit / returns ----------
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "due_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "due_date" date;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "returned_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "shipping_address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "customer_gstin" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "client_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bills_client_ref_idx" ON "bills" USING btree ("client_ref");--> statement-breakpoint
-- Bills completed before this migration were settled at the counter: record them as paid.
UPDATE "bills" SET "paid_amount" = "grand_total" WHERE "paid_amount" = 0 AND "due_amount" = 0 AND "grand_total" > 0;--> statement-breakpoint

ALTER TABLE "bill_items" ADD COLUMN IF NOT EXISTS "cost_per_unit" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "bill_items" ADD COLUMN IF NOT EXISTS "returned_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

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
);--> statement-breakpoint

-- Retail keeps the plain running bill numbers it has always printed.
INSERT INTO "mode_settings" ("mode", "invoice_prefix", "payment_methods", "allow_credit", "default_credit_days")
VALUES ('retail', '', 'Cash,UPI,Card', false, 0)
ON CONFLICT ("mode") DO NOTHING;--> statement-breakpoint
INSERT INTO "mode_settings" ("mode", "invoice_prefix", "payment_methods", "allow_credit", "default_credit_days", "enforce_moq")
VALUES ('wholesale', 'W', 'Cash,UPI,Card,Bank Transfer,Cheque,Credit', true, 30, true)
ON CONFLICT ("mode") DO NOTHING;--> statement-breakpoint

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
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_batch_idx" ON "stock_movements" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_mode_idx" ON "stock_movements" USING btree ("mode");--> statement-breakpoint

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
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_mode_idx" ON "payments" USING btree ("mode");--> statement-breakpoint

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
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_returns_mode_idx" ON "sales_returns" USING btree ("mode");--> statement-breakpoint

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
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_returns_mode_idx" ON "purchase_returns" USING btree ("mode");--> statement-breakpoint

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
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_mode_idx" ON "purchase_orders" USING btree ("mode");--> statement-breakpoint

-- ---------- Branding ----------
-- Rename the default shop and drop the old brand's logo path. Only rows still
-- carrying the previous defaults are touched; anything an owner typed in is kept.
UPDATE "settings" SET "shop_name" = 'Nalam Care Medicals' WHERE "id" = 1 AND "shop_name" = 'AK PHARMA';--> statement-breakpoint
UPDATE "settings" SET "logo" = '/logos/nalam-care-medicals-logo.png'
WHERE "id" = 1 AND "logo" IN ('/logos/ak-pharma-logo-square.jpeg', '/logos/ak-pharma-logo-banner.jpeg', '/logo.jpeg');--> statement-breakpoint
-- The previous owner's contact details would otherwise print on Nalam Care
-- Medicals invoices. Clear them only while they still hold the old values; the
-- new details are entered in Settings.
UPDATE "settings" SET
  "full_name" = CASE WHEN "full_name" = 'Aravinthan A' THEN '' ELSE "full_name" END,
  "address" = CASE WHEN "address" = 'NO 2 , Venugopalapuram , kill nachipattu post , Tiruvannamalai 606 611' THEN '' ELSE "address" END,
  "phone" = CASE WHEN "phone" = '7259103278' THEN '' ELSE "phone" END,
  "email" = CASE WHEN "email" = 'akaravinthan2413@gmail.com' THEN '' ELSE "email" END
WHERE "id" = 1;
