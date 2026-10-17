/* ==========================================================================
   Nalam Care Medicals — operating modes

   The app runs two independent dashboards on one shared medicine catalogue.
   Everything else (stock, bills, customers, suppliers, payments, reports,
   settings) belongs to exactly one mode.
   ========================================================================== */

export type Mode = "retail" | "wholesale";

export const MODES: Mode[] = ["retail", "wholesale"];

export const MODE_LABEL: Record<Mode, string> = {
  retail: "Retail Billing",
  wholesale: "Wholesale Billing",
};

export const isMode = (value: unknown): value is Mode => value === "retail" || value === "wholesale";

export const APP_NAME = "Nalam Care Medicals";

export type Role = "admin" | "staff";

/** What the browser is told about the signed-in user. The server re-checks the signed cookie
    (and, for user accounts, the account's current role and dashboard access) on every request. */
export type SessionInfo = {
  role: Role;
  modes: Mode[];
  /** Display name; empty for the built-in admin / shared staff passcodes. */
  name?: string;
  /** Set when signed in with an account from Settings → Users. */
  userId?: string;
};
