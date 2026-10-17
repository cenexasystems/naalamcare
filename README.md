# Nalam Care Medicals — Pharmacy Management System

Retail and wholesale pharmacy management in one app: POS billing, purchases, inventory,
customers, suppliers, invoices & payments, reports and expiry alerts.

The app has **two independent dashboards**:

| Dashboard | For |
|---|---|
| **Nalam Care Medicals — Retail Billing** | Counter sales to walk-in customers, retail stock |
| **Nalam Care Medicals — Wholesale Billing** | Bulk orders to retailers, medical shops, clinics, hospitals and distributors; wholesale stock |

Both use **one shared medicine catalogue**. Everything else is separate per dashboard:
stock and batches, prices, bills, customers, suppliers, payments, returns, purchase orders,
reports and dashboard settings.

## How the split works

- **Catalogue (shared).** A medicine is added once (from Purchase or Inventory → Medicine
  Master → Add Medicine) and appears in both dashboards. Editing it updates the one record.
  Medicines with stock or sales history are *archived* instead of deleted.
- **Stock (per dashboard).** Every batch belongs to retail or wholesale. Retail receipts and
  sales only touch retail batches, wholesale only wholesale batches. Each batch carries its own
  purchase rate, MRP and selling price, so retail and wholesale prices differ naturally.
  Nothing is synchronised between the two; there are no automatic transfers.
- **Stock ledger.** Every change (receipt, sale, return, void, purchase return, damaged /
  expired write-off, correction, reconciliation) is written to `stock_movements` — see
  Inventory → history icon on a batch.
- **Server-side checks.** Billing, receipts, returns and adjustments run in transactions with
  conditional updates: stock can't go negative, expired batches and prices above MRP are
  refused, and a double-submitted bill returns the first bill instead of deducting stock twice.

### Legacy data (before the split)

Existing batches, bills, customers and suppliers are **not** assigned to either dashboard by the
migration — they keep `mode = NULL`. An admin assigns them in **Settings → Reconciliation**
(per batch for stock; all at once for bills / customers / suppliers). Until then legacy stock
can't be billed and Inventory shows a reminder.

## Screens

| Screen | Retail | Wholesale |
|---|---|---|
| Dashboard | Retail overview | Wholesale overview |
| Billing (POS) | Existing counter POS: search / barcode, batch, qty, price, discount, customer details, Cash / UPI / Card (Credit if enabled), print | Packs or units, wholesale price, customer discount %, quantity-tier discounts, minimum order checks, business customer, credit terms with part payment and due date, ship-to address |
| Purchase | Goods receipt, Purchase Orders, Purchase Returns | Same, against wholesale suppliers and stock |
| Inventory | Batch stock, filters, adjust (damaged / expired / correction), movement history, Medicine Master | Same for wholesale stock |
| Customers / Customers & Distributors | Profiles, purchase history, outstanding, receive payment, credit limit | Plus business type, GSTIN, shipping address, credit period, discount % |
| Suppliers | Purchases, payments, returns and balance owed; record payments | Same |
| Invoices & Payments | Invoice status (paid / part paid / due / overdue), receive payment, sales returns with refund or set-off against due | Same |
| Reports | Sale report + Excel exports; product-wise, customer-wise, profit margin, GST summary, purchases, stock valuation, receivables & overdue, returns | Same, wholesale data |
| Expiry Alert | Expired / expiring / low stock | Same |
| Settings | Shop details (shared), retail settings, suppliers, reconciliation | Shop details (shared), wholesale settings |

**Dashboard settings** (per mode): invoice number prefix (retail defaults to plain numbers,
wholesale to `W1`, `W2`…), payment methods, credit sales and default credit days, low-stock
threshold, expiry-alert months, cap on manual discount, quantity-discount tiers and minimum
order enforcement (wholesale), invoice terms.

Customer IDs: `NCM000001` (retail), `NCW000001` (wholesale). Older `AKP…` IDs are kept.

## Access

One login page, two roles — **Admin** and **Staff**. Retail and Wholesale are dashboards
inside the app, not roles or separate logins.

1. Everyone signs in on the same login page with their own passcode.
2. Admins open both dashboards; each staff account is given Retail, Wholesale or both.
3. Users with both pick a dashboard after login and switch from the user menu (top right)
   without signing in again. Users with one dashboard go straight into it. The chosen
   dashboard survives a refresh.

- **Admin** — both dashboards, all screens, user management (Settings → Users & Access),
  shared catalogue and shop details, per-dashboard settings, reconciliation.
- **Staff** — Billing, Inventory, Customers, Invoices & Payments, Reports and Expiry Alert in
  the dashboards their account allows.

Accounts live in the `app_users` table (passcodes stored as a scrypt hash). `ADMIN_PASSCODE`
always signs in as admin so the owner can never be locked out; the optional shared
`STAFF_PASSCODE` (dashboards from `STAFF_MODES`) is kept for existing installs.

The session is a signed httpOnly cookie. For accounts, the server re-reads the role and
dashboard access on every request, so changes apply immediately. Every API route
(`/api/*?mode=retail|wholesale`) and server action checks it: a dashboard the user can't open
gets **403**, missing mode **400**, no session **401**. Invoices (`/invoice/[id]`) open only for
signed-in users with access to that bill's dashboard.

## Purchase calculations

Input fields: **Purchase Unit, Quantity, Purchase Rate, MRP, Selling Price, GST %**.

| Value | Formula | Example |
|---|---|---|
| Stock Added | Purchase Unit × Quantity | 10 × 2 = **20** |
| Total (₹) | MRP × Quantity | 60 × 2 = **120** |
| Per unit price | Selling Price ÷ Purchase Unit | 40 ÷ 10 = **4** |
| Discount | MRP − Selling Price | 60 − 40 = **20** |

**GST is included in the MRP and the selling price.** It is extracted for the bill summary and
GST report, never added on top.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `F2` | Focus the global medicine search |
| `F5` | Add to bill (Billing) / Save (Purchase) |
| `F6` | Hold bill |
| `F11` / `F12` | Pay & Print (retail) / Save & Print (wholesale) |

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Drizzle ORM ·
Neon Postgres · SWR · `lucide-react`.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in DATABASE_URL, passcodes, SESSION_SECRET
npm run dev
```

### Database

New database: run `database.sql`, then `drizzle/0006_add_invoice_customer_details.sql` and
`drizzle/0007_nalam_dual_mode.sql`, then `drizzle/0008_nalam_shop_details.sql` and `drizzle/0009_app_users.sql` (Neon SQL editor or `psql`). Optional sample data:
`npx tsx scripts/seed.ts` (seeds into the retail dashboard).

Existing database: run `drizzle/0007_nalam_dual_mode.sql`, then `drizzle/0008_nalam_shop_details.sql` (shop address, phone, email, logo and the logo-blue theme) and
`drizzle/0009_app_users.sql` (user accounts). It is additive and safe to re-run:
new columns and tables only, legacy rows left unclassified, bills already settled at the
counter marked as paid. It renames the shop to Nalam Care Medicals only if it still has the
old default name, and clears the previous owner's address / phone / email only if they still
hold the old values, so they don't print on new invoices.

## URLs

- POS: `/` or `/pos/admin/secure/control-panel/nalam-care-medicals`
  (the old `/…/ak-pharma` address redirects here)
- Printable invoice / PDF: `/invoice/[bill-no]`
- Public store page: `/store` (details come from Settings → Shop Details)

## Project layout

```
app/
  pos/admin/secure/control-panel/nalam-care-medicals/page.tsx   app shell (login, dashboard picker, screens)
  api/*/route.ts            mode-scoped JSON for the screens
  invoice/[id]/             printable bill
components/pms/             one component per screen (+ WholesaleBilling, Suppliers, Payments)
lib/
  auth.ts                   signed session cookie, passcodes, mode guards
  mode.ts                   retail / wholesale definitions
  actions.ts                server actions (all writes)
  db/schema.ts, queries.ts  Drizzle schema and mode-scoped reads
  calc.ts, format.ts, xlsx.ts
drizzle/                    SQL migrations
branding-archive/           previous brand's logo files (not served)
```

## License

© 2026 Nalam Care Medicals. All Rights Reserved.

Powered by [Cenexa Systems](https://www.cenexasystems.com/).
