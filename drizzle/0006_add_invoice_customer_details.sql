ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "age" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "gender" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "customer_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "customer_age" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "customer_gender" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "prescription_no" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "billed_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "txn_ref" text DEFAULT '' NOT NULL;
