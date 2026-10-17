# Neon DB Backend — Implementation Plan

**Project:** AK Pharma — Pharmacy Management System
**Goal:** Replace the browser‑only `localStorage` store with a **Neon (serverless Postgres)** backend so data is shared across devices, survives browser resets, and is queryable/backed‑up centrally.
**Stack today:** Next.js 16.3 (App Router) · React 19 · TypeScript · Tailwind v4 · `lucide-react`. No database, no server data layer.

> ⚠️ **This is NOT a drop‑in swap.** The README says "swap `lib/store.ts` for a remote implementation with the same API surface," but that API is **synchronous** and runs **in the browser**. A real database can only be reached from the **server**, and every call becomes **async**. That single change ripples through every screen. This plan is about managing that ripple safely and in phases.

---

## 1. Current state (what we're migrating away from)

| Concern | Today |
|---|---|
| Persistence | `window.localStorage["ak_pharma_pms_v2"]`, one JSON blob |
| Data access | [`lib/store.ts`](lib/store.ts) — **synchronous** read/write, in‑memory `cache`, `version` counter |
| Reactivity | `useSyncExternalStore(subscribe, …Snapshot, …empty)` — every write bumps `version`, all screens re‑render |
| Data flow | Shell [page.tsx](app/pos/admin/secure/control-panel/ak-pharma/page.tsx) reads all collections once, passes them down as props |
| Direct store calls in components | `Billing` (`peekBillNo`, `listHeldBills`, `saveHeldBills`, `submitBill`), `Purchase`/`Inventory` (`saveBatch`, `saveMedicine`, `deleteBatch`, `deleteMedicine`), `Customers` (`saveCustomer`, `deleteCustomer`), `Reports` (`deleteBill`, `listBatchRows`), `Settings` (`getSettings`, `saveSettings`, `saveSupplier`, `deleteSupplier`, `exportBackup`, `importBackup`, `resetStore`), `Invoice` (`getBill`, `getSettings`) |
| Counters / IDs | `store.counters.bill` → `B000125`, `store.counters.customer` → `AKP000001` (in‑JSON integers) |
| Auth | Client‑side passcode compared against `NEXT_PUBLIC_ADMIN_PASSCODE` / `NEXT_PUBLIC_STAFF_PASSCODE` (ships in the bundle) |
| Invoice sharing | `/invoice/[id]` only opens on the device that created the bill (data is local) |

**Domain model** (from [`lib/types.ts`](lib/types.ts)): `Medicine`, `Supplier`, `Batch`, `Customer`, `Bill` + `BillItem`, `HeldBill`, `ShopSettings`, plus `counters`. `Batch` holds live stock (`stock_qty`); `Bill.items` is embedded.

**Calculation rules** live in [`lib/calc.ts`](lib/calc.ts) and are pure — **they do not change**. GST is inclusive; nothing is added on top. Reuse `calcBillTotals` server‑side so totals are computed identically.

---

## 2. Target architecture

```
Browser (Client Components — unchanged UI)
   │  read: SWR hook  ──────────────►  Route Handlers  GET /api/*        ┐
   │  write: await serverAction(...)►  Server Actions  "use server"      │  server-only
   │                                                     │               │
   │                                          lib/db (Drizzle + schema)  │
   │                                                     │               │
   └──────────────────────────────────────►  @neondatabase/serverless ──┘
                                                         │
                                                    Neon Postgres
```

**Core decisions**

1. **All DB access is server‑only.** Postgres credentials never reach the browser. Reads happen in Route Handlers / Server Components; writes happen in Server Actions.
2. **Keep the existing client UI.** Components stay Client Components. We change *where the data comes from*, not how screens look.
3. **Reads → SWR** hitting `GET /api/*` Route Handlers. SWR replaces `useSyncExternalStore`: it caches, dedupes, and exposes `mutate()` to re‑fetch after a write — preserving today's "write → everything refreshes" feel with minimal churn.
4. **Writes → Server Actions** (`"use server"`), invoked from event handlers with `await`. After a successful action, call SWR `mutate()` (client) and/or `revalidatePath` (server) so screens reflect the change.
5. **`lib/store.ts` is retired** and replaced by `lib/db/*` (schema + queries) and `lib/actions.ts` (mutations). The old file can stay temporarily as a localStorage fallback behind a feature flag during rollout (see §12).

> **Why SWR and not "make the shell a Server Component"?** The shell owns `sessionStorage` auth, keyboard shortcuts, and cross‑screen client state — it must stay `"use client"`. SWR is the lowest‑risk way to feed a client shell from a server DB. The **invoice page is the exception**: it has no client state worth keeping and becomes a clean async Server Component (§4, Phase 5).

---

## 3. Technology choice

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Drizzle ORM + `@neondatabase/serverless`** | Type‑safe, schema mirrors `lib/types.ts`, tiny runtime, first‑class Neon support, SQL‑like | One‑time schema authoring | ✅ **Recommended** |
| Raw SQL via `@neondatabase/serverless` only | Zero ORM, closest to the hand‑written `store.ts` style | No type safety on rows, manual mapping | Good lightweight alt |
| Prisma | Popular, migrations UI | Heavy client, codegen step, `@prisma/client` must be externalized | Overkill here |

**Recommendation: Drizzle ORM.** The typed table definitions map 1‑to‑1 onto the existing `Medicine`/`Batch`/… types, and Drizzle Kit gives us migrations + a push workflow.

**Driver note (matters for billing):**
- `drizzle-orm/neon-http` (HTTP) — great for simple reads/writes, **no interactive transactions**.
- `drizzle-orm/neon-serverless` (WebSocket `Pool`) — supports `db.transaction()`.

`submitBill` needs an **atomic** multi‑statement transaction (insert bill + items, decrement each batch's stock, bump the bill counter). **Use the `neon-serverless` (Pool) driver** so `db.transaction(async (tx) => …)` is available. Simple screens can share the same `db`.

Neon's serverless driver is pure JS (fetch/WebSocket), so **no `serverExternalPackages` entry is needed**. (Only the native `pg` driver would need externalizing — we are not using it.)

---

## 4. Database schema

Postgres DDL mapped from `lib/types.ts`. Money columns use `numeric(12,2)`; dates that are `yyyy-mm` strings today stay `text` to avoid changing the UI's month handling (`monthShort`, `mfg_date`, `exp_date`). Server‑authoritative IDs use sequences.

```sql
-- Sequences drive the client-facing IDs (replace store.counters)
CREATE SEQUENCE bill_seq     START WITH 125;   -- next bill => B000125
CREATE SEQUENCE customer_seq START WITH 1;     -- next id   => AKP000001

CREATE TABLE suppliers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  phone       text NOT NULL DEFAULT '',
  gstin       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE medicines (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generic_name         text NOT NULL,
  brand_name           text NOT NULL DEFAULT '',
  manufacturer         text NOT NULL DEFAULT '',
  salt                 text NOT NULL DEFAULT '',
  schedule             text NOT NULL,             -- H | H1 | X | NRX | OTC
  hsn_code             text NOT NULL DEFAULT '',
  gst_percent          numeric(5,2) NOT NULL DEFAULT 0,
  purchase_unit_type   text NOT NULL,             -- Strip | Piece | Bottle
  low_stock_threshold  integer NOT NULL DEFAULT 20,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX medicines_generic_idx ON medicines (generic_name);

CREATE TABLE batches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id         uuid NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  supplier_id         uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  invoice_no          text NOT NULL DEFAULT '',
  purchase_date       date NOT NULL,
  batch_no            text NOT NULL,
  mfg_date            text NOT NULL DEFAULT '',   -- yyyy-mm
  exp_date            text NOT NULL DEFAULT '',   -- yyyy-mm
  box                 text NOT NULL DEFAULT '',
  purchase_unit_type  text NOT NULL,
  pack_size           integer NOT NULL DEFAULT 1,
  qty_packs           integer NOT NULL DEFAULT 0,
  stock_added         integer NOT NULL DEFAULT 0,
  stock_qty           integer NOT NULL DEFAULT 0,
  purchase_rate       numeric(12,2) NOT NULL DEFAULT 0,
  mrp                 numeric(12,2) NOT NULL DEFAULT 0,
  selling_price       numeric(12,2) NOT NULL DEFAULT 0,
  gst_percent         numeric(5,2) NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX batches_medicine_idx ON batches (medicine_id);
CREATE INDEX batches_exp_idx      ON batches (exp_date);

CREATE TABLE customers (
  id           text PRIMARY KEY,                  -- AKP000001 (formatted from customer_seq)
  name         text NOT NULL,
  phone        text NOT NULL DEFAULT '',
  address      text NOT NULL DEFAULT '',
  doctor_name  text NOT NULL DEFAULT '',
  quick_bill   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customers_phone_idx ON customers (phone) WHERE phone <> '';

CREATE TABLE bills (
  id               text PRIMARY KEY,              -- B000125 (formatted from bill_seq)
  customer_id      text REFERENCES customers(id) ON DELETE SET NULL,
  customer_name    text NOT NULL DEFAULT '',
  customer_phone   text NOT NULL DEFAULT '',
  customer_address text NOT NULL DEFAULT '',
  doctor_name      text NOT NULL DEFAULT '',
  bill_date        date NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  sub_total        numeric(12,2) NOT NULL,
  discount         numeric(12,2) NOT NULL,
  taxable_amount   numeric(12,2) NOT NULL,
  gst_amount       numeric(12,2) NOT NULL,
  gst_percent      numeric(5,2)  NOT NULL,
  grand_total      numeric(12,2) NOT NULL,
  received_amount  numeric(12,2) NOT NULL DEFAULT 0,
  change_amount    numeric(12,2) NOT NULL DEFAULT 0,
  payment_method   text NOT NULL,                 -- Cash | UPI | Card
  status           text NOT NULL DEFAULT 'COMPLETED'
);
CREATE INDEX bills_created_idx  ON bills (created_at DESC);
CREATE INDEX bills_customer_idx ON bills (customer_id);

CREATE TABLE bill_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id            text NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  medicine_id        uuid,        -- kept as snapshot ref, not FK-enforced (medicine may be deleted later)
  batch_id           uuid,
  generic_name       text NOT NULL,
  brand_name         text NOT NULL DEFAULT '',
  manufacturer       text NOT NULL DEFAULT '',
  schedule           text NOT NULL,
  hsn_code           text NOT NULL DEFAULT '',
  batch_no           text NOT NULL DEFAULT '',
  mfg_date           text NOT NULL DEFAULT '',
  exp_date           text NOT NULL DEFAULT '',
  box                text NOT NULL DEFAULT '',
  purchase_unit_type text NOT NULL,
  pack_size          integer NOT NULL DEFAULT 1,
  qty                integer NOT NULL,
  mrp_per_unit       numeric(12,2) NOT NULL,
  per_unit_price     numeric(12,2) NOT NULL,
  line_mrp           numeric(12,2) NOT NULL,
  line_amount        numeric(12,2) NOT NULL,
  line_discount      numeric(12,2) NOT NULL,
  gst_percent        numeric(5,2)  NOT NULL
);
CREATE INDEX bill_items_bill_idx ON bill_items (bill_id);

-- Single-row shop settings (id is always 1)
CREATE TABLE settings (
  id                  integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shop_name           text NOT NULL,
  address             text NOT NULL,
  phone               text NOT NULL,
  gstin               text NOT NULL,
  dl_no               text NOT NULL,
  default_gst         numeric(5,2) NOT NULL DEFAULT 12,
  low_stock_threshold integer NOT NULL DEFAULT 20,
  expiry_alert_months integer NOT NULL DEFAULT 6
);
```

**Notes**
- `numeric` columns come back from the driver as **strings**. The query layer must coerce to `number` (a `toNum()` helper) before handing rows to components so `lib/calc.ts` and the UI keep working unchanged.
- **Held bills** (`HeldBill`) are ephemeral, per‑terminal, pre‑checkout carts. **Decision needed** (§11): keep them client‑local in `localStorage` (recommended — simplest, matches their nature) *or* add a `held_bills` table for cross‑terminal resume.
- The embedded `Bill.items` shape is reconstructed by joining `bill_items` in the read layer, so the `Bill` type the UI consumes is unchanged.

---

## 5. Environment & project setup

**Provision (one‑time)**
1. Create a Neon project → get the **pooled** connection string.
2. Add to `.env.local` (already git‑ignored via `.env*`):
   ```env
   DATABASE_URL="postgresql://<user>:<pass>@<host>-pooler.<region>.aws.neon.tech/<db>?sslmode=require"
   # existing passcodes stay for now, but see §Phase 6 for hardening
   NEXT_PUBLIC_ADMIN_PASSCODE=...
   NEXT_PUBLIC_STAFF_PASSCODE=...
   ```
   > `.gitignore` already ignores `.env*`, `schema.sql`, and `seed.sql` — the repo was clearly set up anticipating this migration.
3. Configure the same `DATABASE_URL` in the deploy target (Vercel env vars) for Preview + Production. Prefer the **Vercel ↔ Neon** native integration so previews get isolated branches.

**Dependencies**
```bash
npm i drizzle-orm @neondatabase/serverless
npm i -D drizzle-kit
```
Optional (reads): `npm i swr`

---

## 6. New file layout

```
lib/
  db/
    client.ts        # Neon Pool + drizzle() instance (server-only)
    schema.ts        # Drizzle table definitions (mirrors lib/types.ts)
    map.ts           # row -> app-type coercion (numeric strings -> numbers, item join)
    queries.ts       # read functions: listMedicines(), listBatchRows(), listBills(), ...
  actions.ts         # "use server" mutations: saveMedicine, saveBatch, submitBill, ...
  ids.ts             # formatBillNo(n) / formatCustomerId(n) helpers (pure)
  store.ts           # RETIRED (kept behind a flag during rollout, then deleted)
app/
  api/
    medicines/route.ts     # GET -> listMedicines()
    batches/route.ts       # GET -> listBatchRows()
    bills/route.ts         # GET -> listBills()
    customers/route.ts     # GET -> listCustomers()
    suppliers/route.ts     # GET -> listSuppliers()
    settings/route.ts      # GET -> getSettings()
components/pms/
  data.ts            # useMedicines(), useBills(), ... SWR hooks + a mutateAll() helper
drizzle/             # generated migrations (drizzle-kit)
drizzle.config.ts
```

---

## 7. Phased implementation

### Phase 0 — Provision & install *(0.5 day)*
Create Neon project, set `DATABASE_URL`, install deps, add `drizzle.config.ts`. No app code touched yet. **Checkpoint:** `npx drizzle-kit` runs.

### Phase 1 — Schema, connection, seed *(1 day)*
- Author `lib/db/schema.ts` (Drizzle) matching §4.
- `lib/db/client.ts`:
  ```ts
  import 'server-only';
  import { Pool } from '@neondatabase/serverless';
  import { drizzle } from 'drizzle-orm/neon-serverless';
  import * as schema from './schema';

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  export const db = drizzle(pool, { schema });
  ```
- Generate & push: `npx drizzle-kit generate` → `npx drizzle-kit push`.
- Port `buildSeed()` from `store.ts` into a `scripts/seed.ts` that inserts the same starter catalogue **only when tables are empty** (idempotent). Reset `bill_seq`/`customer_seq` to match seeded rows.

**Checkpoint:** tables + seed rows visible in the Neon console.

### Phase 2 — Server data layer *(2 days)*
- `lib/db/queries.ts` — async equivalents of every read selector in `store.ts`:
  `listMedicines`, `joinBatches`, `listBatchRows`, `listSuppliers`, `listCustomers`, `findCustomerByPhone`, `listBills`, `getBill`, `getSettings`, `customerHistory`. Each returns the **same shapes** the UI already consumes (run `numeric`→`number` coercion + item join in `lib/db/map.ts`).
- `lib/actions.ts` (`"use server"`) — async equivalents of every mutation:
  `saveMedicine`, `deleteMedicine`, `saveSupplier`, `deleteSupplier`, `saveBatch`, `deleteBatch`, `adjustBatchStock`, `saveCustomer`, `deleteCustomer`, `saveSettings`, `submitBill`, `deleteBill`.
- **`submitBill` is the critical one** — wrap in a transaction and reuse `calcBillTotals`:
  ```ts
  'use server';
  export async function submitBill(payload: SubmitPayload): Promise<Bill> {
    return db.transaction(async (tx) => {
      // 1. nextval('bill_seq') -> formatBillNo()
      // 2. upsert customer (nextval('customer_seq') for new) -> customerId
      // 3. calcBillTotals(payload.lines)
      // 4. insert bills row
      // 5. insert bill_items rows
      // 6. UPDATE batches SET stock_qty = GREATEST(0, stock_qty - $qty) per line
      // 7. return the assembled Bill
    });
    // revalidatePath('/pos/...') optional; client mutate() also refreshes
  }
  ```
  This replaces `store.counters` and the in‑JS stock decrement, and fixes the **multi‑device race** (two terminals can't mint the same bill number).
- `deleteBill` returns stock inside a transaction (mirrors current logic).

**Checkpoint:** unit‑call queries/actions from a scratch route; verify rows change in Neon.

### Phase 3 — Client data wiring *(2 days)* — the big refactor
- Add `GET` Route Handlers under `app/api/*` that call `lib/db/queries.ts`.
- Add `components/pms/data.ts` SWR hooks:
  ```ts
  'use client';
  import useSWR from 'swr';
  const fetcher = (u: string) => fetch(u).then(r => r.json());
  export const useMedicines = () => useSWR('/api/medicines', fetcher);
  // ... bills, customers, suppliers, batches, settings
  ```
- Rewrite the **shell** [page.tsx](app/pos/admin/secure/control-panel/ak-pharma/page.tsx): replace the six `useSyncExternalStore` calls with SWR hooks. Show a loading state until first data arrives (the shell already has a `checking`/`Loading…` pattern to reuse). Provide a `mutateAll()` that revalidates every collection; pass it (or the specific `mutate`) down where `onChanged/onDone/onSaved` currently fire toasts, so a write refreshes the data too.

**Checkpoint:** app renders live data from Neon; toasts still fire.

### Phase 4 — Per‑screen mutation migration *(2–3 days)*
Convert each screen's direct store calls to `await`ed Server Actions, then `mutate()`:

| Screen | Calls to convert |
|---|---|
| `Billing` | `submitBill` (await → open invoice), `peekBillNo` → derive from a `GET /api/next-bill-no` or return it from `submitBill`; held bills stay client‑local unless §11 says otherwise |
| `Purchase` | `saveMedicine`, `saveBatch` |
| `Inventory` | `saveMedicine`, `saveBatch`, `deleteBatch`, `deleteMedicine`, `adjustBatchStock` |
| `Customers` | `saveCustomer`, `deleteCustomer` |
| `Reports` | `deleteBill`; `listBatchRows` now comes from props/SWR |
| `Settings` | `saveSettings`, `saveSupplier`, `deleteSupplier`; **backup/restore** → server export/import endpoints; `resetStore` → guarded admin action |

Handlers become `async`; add `pending` UI via `useTransition`/`useActionState` where a spinner helps (checkout, saves). `peekBillNo` is currently shown live in the cart header — simplest is to have the API/route return the next number, or accept that the definitive number is assigned on submit and display "auto" until then.

**Checkpoint:** every screen reads and writes through Neon.

### Phase 5 — Invoice page → Server Component *(0.5 day)*
Rewrite [app/invoice/[id]/page.tsx](app/invoice/[id]/page.tsx) as an `async` Server Component that fetches the bill + settings directly from Neon (`await getBill(id)`, `await getSettings()`). Drop the `useSyncExternalStore` "bill only opens on the creating device" limitation — **now any device can open any invoice** (a real win). Keep `InvoiceActions` (print/back) as the small client island; auto‑print stays client‑side.

### Phase 6 — Auth hardening *(1 day, recommended)*
Today the passcodes ship in the client bundle and there is **no server‑side protection** — once there's a shared DB, anyone hitting `/api/*` or a Server Action bypasses the UI gate. Minimum bar:
- Move passcode check to a Server Action that sets a signed, httpOnly session cookie (admin/staff role).
- Gate every mutating Server Action and every `GET /api/*` on that cookie; enforce admin‑only actions (Purchase/Reports/Settings/delete) server‑side.
- Optionally protect the whole `/pos/...` route via `proxy.ts`/middleware.

*(Can ship after Phase 5 as a fast follow, but do it before real multi‑user rollout.)*

### Phase 7 — Data migration from existing devices *(0.5 day)*
Existing shops already have data in `localStorage`. Provide a one‑time import: **Settings → Download backup** already emits the full `Store` JSON (`exportBackup`). Add a server **import** endpoint that accepts that JSON and upserts medicines/suppliers/batches/customers/bills, then advances `bill_seq`/`customer_seq` past the imported max. Run once per existing device, newest data wins / dedupe by natural keys (phone, batch_no+medicine).

### Phase 8 — Test & deploy *(1 day)*
- Manual pass over every screen (bill → stock decrement → invoice; purchase adds batch; delete returns stock; exports still generate).
- Concurrency check: two browsers billing at once get distinct bill numbers.
- Set Neon `DATABASE_URL` in Vercel (Preview + Prod); confirm Neon branch per preview if using the integration.
- Remove the `store.ts` fallback flag and delete dead code.

**Total: ~10–12 working days** for one developer, Phases 0–5 being the functional core (~8 days) and 6–8 the hardening/cutover.

---

## 8. API surface mapping (old → new)

| `lib/store.ts` (sync, browser) | New home | Kind |
|---|---|---|
| `readStore`, `writeStore`, `mutate`, `subscribe`, `getVersion` | *(removed — SWR + DB replace this)* | — |
| `listMedicines`, `joinBatches`, `listBatchRows` | `lib/db/queries.ts` | async read |
| `listSuppliers`, `listCustomers`, `findCustomerByPhone` | `lib/db/queries.ts` | async read |
| `listBills`, `getBill`, `customerHistory` | `lib/db/queries.ts` | async read |
| `getSettings` | `lib/db/queries.ts` | async read |
| `peekBillNo`, `nextCustomerId` | `lib/ids.ts` + `nextval()` in a tx | server |
| `saveMedicine`, `deleteMedicine` | `lib/actions.ts` | server action |
| `saveSupplier`, `deleteSupplier` | `lib/actions.ts` | server action |
| `saveBatch`, `deleteBatch`, `adjustBatchStock` | `lib/actions.ts` | server action |
| `saveCustomer`, `deleteCustomer` | `lib/actions.ts` | server action |
| `saveSettings` | `lib/actions.ts` | server action |
| `submitBill`, `deleteBill` | `lib/actions.ts` (**transaction**) | server action |
| `saveHeldBills`, `listHeldBills` | client `localStorage` (or `held_bills` table — §11) | client/tbd |
| `exportBackup`, `importBackup`, `resetStore` | server export/import/reset endpoints | server |
| `*Snapshot`, `empty*`, `getServerVersion` | *(removed — SWR cache replaces snapshots)* | — |

Reused unchanged: `lib/calc.ts`, `lib/format.ts`, `lib/xlsx.ts`, `lib/types.ts` (types stay the source of truth; Drizzle schema conforms to them).

---

## 9. Key challenges & how the plan handles them

1. **Sync → async ripple.** Every read/write becomes a Promise. Mitigation: SWR for reads (keeps the reactive prop‑drilling model), `await` + `mutate()` for writes, phased screen‑by‑screen conversion (Phase 4) so nothing breaks all at once.
2. **Atomicity & the bill‑number race.** `submitBill`/`deleteBill` must be transactional. Mitigation: `neon-serverless` Pool driver + `db.transaction()`, sequences for IDs. This is the main reason to prefer the WebSocket driver over HTTP.
3. **`numeric` → string coercion.** Postgres returns money/percent as strings. Mitigation: a single `map.ts` coercion boundary so components/`calc.ts` keep receiving `number`s.
4. **Auth is currently cosmetic.** A shared DB makes unprotected `/api/*` and Server Actions a real exposure. Mitigation: Phase 6 (server‑side session + per‑action role checks). Flagged as required before multi‑user rollout.
5. **Held bills.** Ephemeral carts don't obviously belong in a shared DB. Mitigation: keep client‑local by default; a table only if cross‑terminal resume is wanted (§11).
6. **Offline / latency.** localStorage was instant and offline‑capable; Neon adds network latency and needs connectivity. Mitigation: SWR caching + optimistic UI on hot paths (add‑to‑bill stays fully client‑side until checkout; only `submitBill` hits the network). Note this trade‑off for the shop's connectivity reality.
7. **Invoice cross‑device.** Turns from a limitation into a feature once bills live server‑side (Phase 5).
8. **Cost/limits.** Neon free tier is fine for a single pharmacy; use the **pooled** endpoint for serverless functions to avoid connection exhaustion.

---

## 10. Rollback / fallback strategy

- Land the new layer behind a `NEXT_PUBLIC_DATA_BACKEND` flag (`local` | `neon`). Keep `store.ts` intact until Phase 8. If Neon misbehaves in production, flip back to `local` without a redeploy of components.
- Keep Drizzle migrations in `drizzle/` under version control; never hand‑edit the DB.
- Nightly Neon backup/branch (or `pg_dump`) once live.

---

## 11. Open decisions (need your input before/at Phase 2–4)

1. **ORM vs raw SQL** — plan assumes **Drizzle**. Prefer raw `@neondatabase/serverless` (lighter, closer to today's hand‑written style)?
2. **Held bills** — keep **client‑local** (recommended) or make them a shared table?
3. **Auth scope** — do this migration as data‑only (Phase 6 later) or harden auth in the same pass? (Strongly recommend same pass before multi‑user.)
4. **Reads: SWR vs server‑render** — plan assumes SWR against Route Handlers to keep the client shell intact. Acceptable to add the `swr` dependency?
5. **Multi‑branch/store** — single pharmacy only, or will this ever be multi‑location (would add a `store_id` column throughout now rather than later)?
6. **Migration of existing localStorage data** — is there live data on devices to import (Phase 7), or is this a fresh start?

---

## 12. Suggested execution order (summary)

```
Phase 0  Provision + deps ............ 0.5d   ──┐ setup
Phase 1  Schema + connect + seed ..... 1.0d   ──┘
Phase 2  Queries + Actions (tx) ...... 2.0d   ──┐ server core
Phase 3  Route Handlers + SWR shell .. 2.0d   ──┤
Phase 4  Per-screen mutations ........ 2.5d   ──┘
Phase 5  Invoice -> Server Component .. 0.5d
Phase 6  Auth hardening .............. 1.0d   (recommended, same pass)
Phase 7  Import existing data ........ 0.5d   (if needed)
Phase 8  Test + deploy + cleanup ..... 1.0d
```

**First reviewable milestone:** end of Phase 3 — the app runs live on Neon for reads with the billing write path working. Everything after is incremental screen conversion + hardening.

---

*Prepared against the codebase as of the current `main` branch. All Next.js patterns above match the bundled Next.js 16.3 docs (`node_modules/next/dist/docs`): Server Actions via `"use server"`, `revalidatePath`/`refresh` from `next/cache`, and server‑side ORM/DB access in Server Components / Route Handlers.*
