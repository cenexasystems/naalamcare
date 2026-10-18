# Nalam Care Medicals — Pharmacy Management System

Retail and wholesale pharmacy management in one app: POS billing, purchases, inventory,
customers, suppliers, invoices & payments, reports and expiry alerts.

The app has **two independent dashboards**:

| Dashboard | For |
|---|---|
| **Nalam Care Medicals — Retail Billing** | Counter sales to walk-in customers, retail stock |
| **Nalam Care Medicals — Wholesale Billing** | Bulk orders to retailers, medical shops, clinics, hospitals and distributors; wholesale stock |

Both use **one shared medicine catalogue** and **one shared supplier directory**. Everything
else is separate per dashboard: stock and batches, prices, bills, customers, purchases,
supplier payments and balances, returns, purchase orders, reports and settings.

## How the split works

- **Catalogue (shared).** A medicine is added once (from Purchase or Inventory → Medicine
  Master → Add Medicine) and appears in both dashboards. Editing it updates the one record;
  past invoices keep the details they were billed with. Medicines with stock or sales history
  are *archived* instead of deleted.
- **Suppliers (shared directory, separate accounts).** A supplier is added once and can be
  bought from in either mode. Purchases, payments, returns and the balance owed are kept per
  mode, so paying the retail balance never touches the wholesale one.
- **Stock (per dashboard).** Every batch belongs to retail or wholesale. Retail receipts and
  sales only touch retail batches, wholesale only wholesale batches. Each batch carries its own
  purchase rate, MRP and selling price, so retail and wholesale prices differ naturally.
  Nothing is synchronised automatically.
- **Stock transfers (explicit, admin only).** Inventory → transfer icon on a batch moves units
  to the other mode in one transaction. The receiving batch keeps the batch number, expiry
  and purchase cost, is linked to the source batch, and gets its own selling price; both sides
  are logged and supplier balances don't change. Batches in a transfer can't be deleted.
- **Stock ledger.** Every change (receipt, sale, return, void, purchase return, damaged /
  expired write-off, correction, transfer, reconciliation) is written to `stock_movements` —
  see Inventory → history icon on a batch.
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

**Settings per mode** — retail and wholesale each have their own:

- **Shop details printed on invoices:** shop name, owner, address, phone, contact number, email,
  **GSTIN** and **drug licence number** (Settings → Retail / Wholesale Shop Details).
- **Stock & tax defaults:** default GST %, low-stock alert level, expiry-alert months.
- **Billing:** invoice number prefix (retail defaults to plain numbers, wholesale to `W1`,
  `W2`…), payment methods, credit sales and default credit days, cap on manual discount,
  quantity-discount tiers and minimum order enforcement (wholesale), invoice terms.

Logo, colour theme and Instagram ID are shared.

Customer IDs: `NCM000001` (retail), `NCW000001` (wholesale). Older `AKP…` IDs are kept.

## Access

One login page, two roles — **Admin** and **Staff**. Retail and Wholesale are dashboards
inside the app, not roles or separate logins.

1. Everyone signs in on the same login page with their own passcode.
2. The app opens directly — there is no separate dashboard-selection screen.
3. The **Billing Mode** selector at the top of the sidebar switches between Retail and
   Wholesale without signing in again, staying on the same screen. It offers only the modes
   the user is permitted: admins get both; each staff account is given Retail, Wholesale or
   both. The chosen mode survives a refresh.

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

The whole schema is one file, **`database.sql`**. Run it in the Neon SQL Editor, with `psql`,
or with `node scripts/setup-db.mjs` (uses `.env.local`). It works on a new, empty database and
is safe to run again on an existing one: it only adds what's missing, never deletes anything,
and never overwrites details changed in Settings.

Optional sample data: `npx tsx scripts/seed.ts` (seeds into the retail dashboard).

## URLs

- POS: `/` or `/pos/admin/secure/control-panel/nalam-care-medicals`
- Printable invoice / PDF: `/invoice/[bill-no]`
- Public store page: `/store` (details come from Settings → Shop Details)

## Project layout

```
app/
  pos/admin/secure/control-panel/nalam-care-medicals/page.tsx   app shell (login, billing mode, screens)
  api/*/route.ts            mode-scoped JSON for the screens
  invoice/[id]/             printable bill
components/pms/             one component per screen (+ WholesaleBilling, Suppliers, Payments)
lib/
  auth.ts                   signed session cookie, passcodes, mode guards
  mode.ts                   retail / wholesale definitions
  actions.ts                server actions (all writes)
  db/schema.ts, queries.ts  Drizzle schema and mode-scoped reads
  calc.ts, format.ts, xlsx.ts
database.sql                complete database schema (single file)
scripts/setup-db.mjs        runs database.sql against DATABASE_URL
```

## License

© 2026 Nalam Care Medicals. All Rights Reserved.

Powered by [Cenexa Systems](https://www.cenexasystems.com/).
