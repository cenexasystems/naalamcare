CREATE SEQUENCE "public"."bill_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 125 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."customer_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medicine_id" uuid NOT NULL,
	"supplier_id" uuid,
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
--> statement-breakpoint
CREATE TABLE "bill_items" (
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
--> statement-breakpoint
CREATE TABLE "bills" (
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
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"doctor_name" text DEFAULT '' NOT NULL,
	"quick_bill" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medicines" (
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
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"shop_name" text NOT NULL,
	"address" text NOT NULL,
	"phone" text NOT NULL,
	"gstin" text NOT NULL,
	"dl_no" text NOT NULL,
	"default_gst" numeric(5, 2) DEFAULT '12' NOT NULL,
	"low_stock_threshold" integer DEFAULT 20 NOT NULL,
	"expiry_alert_months" integer DEFAULT 6 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batches_medicine_idx" ON "batches" USING btree ("medicine_id");--> statement-breakpoint
CREATE INDEX "batches_exp_idx" ON "batches" USING btree ("exp_date");--> statement-breakpoint
CREATE INDEX "bill_items_bill_idx" ON "bill_items" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "bills_created_idx" ON "bills" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bills_customer_idx" ON "bills" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "medicines_generic_idx" ON "medicines" USING btree ("generic_name");