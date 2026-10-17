-- =============================================================================
-- Nalam Care Medicals — user accounts managed by the admin (Settings → Users).
-- One login page, two roles (admin / staff). Dashboard access (retail,
-- wholesale or both) is a permission on the account, not a separate login.
-- The admin passcode in the environment keeps working, so nobody is locked out.
-- Additive and safe to re-run.
-- =============================================================================
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
