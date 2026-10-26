"use server";

import { db } from "./db/client";
import * as schema from "./db/schema";
import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { formatBillId, formatCustomerId, formatPoNumber } from "./ids";
import { calcBillOffer, calcBillTotals, round2 } from "./calc";
import { normalisePromo } from "./promo";
import { calcTypeDiscounts, normaliseTypeDiscounts } from "./type-discounts";
import { parseProductTypes, parsePurchaseUnits } from "./product-types";
import {
  AuthError,
  builtInPasscodeStatus,
  clearSession,
  getSession,
  hashPasscode,
  isReservedPasscode,
  normalisePasscode,
  parseModes,
  requireAdmin,
  requireMode,
  resolvePasscode,
  setBuiltInPasscode,
  writeSession,
} from "./auth";
import { isMode, type Mode, type SessionInfo } from "./mode";
import { listStockMovements, getModeSettings } from "./db/queries";
import type { ActionResult, PurchaseOrderItem, StockMovement } from "./types";

/* ==========================================================================
   Server actions

   Every action that touches business data takes the dashboard `mode` and
   checks — on the server — that the signed-in user may use it. Rows are only
   ever read or written where their `mode` matches, so a retail session can't
   reach wholesale stock, bills, customers or suppliers (and vice versa).
   Stock changes run inside transactions with conditional updates, so stock
   can't go negative and every change lands in the stock_movements ledger.
   ========================================================================== */

/** A problem the user can fix — its message is shown as-is. */
class UserError extends Error {}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;

const fail = (message: string): never => {
  throw new UserError(message);
};

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof UserError || err instanceof AuthError) return { ok: false, error: err.message };
    console.error("[nalam-care-medicals] action failed:", err);
    return { ok: false, error: "Something went wrong while saving. Please try again." };
  }
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const int = (v: unknown): number => Math.trunc(num(v));
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const today = () => new Date().toISOString().slice(0, 10);
const isIsoDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const addDays = (isoDate: string, days: number) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
/** True once a "yyyy-mm" expiry month is over. */
const isExpired = (exp: string) => Boolean(exp) && exp < today().slice(0, 7);
const isNewId = (id: unknown) => !id || (typeof id === "string" && (id.startsWith("id-") || id.startsWith("new-")));

const nextVal = async (exec: Exec, seq: "customer_seq" | "bill_seq" | "wholesale_bill_seq" | "purchase_order_seq") => {
  const res = await exec.execute(sql.raw(`SELECT nextval('${seq}') AS nextval`));
  const row = (res as any).rows ? (res as any).rows[0] : (res as any)[0];
  return parseInt(String(row.nextval), 10);
};

const logMovement = async (
  exec: Exec,
  m: {
    mode: Mode | null;
    batchId: string;
    medicineId: string;
    type: string;
    qtyChange: number;
    balanceAfter: number;
    reference?: string;
    note?: string;
    actor: string;
  },
) => {
  await exec.insert(schema.stockMovements).values({
    mode: m.mode,
    batchId: m.batchId,
    medicineId: m.medicineId,
    type: m.type,
    qtyChange: m.qtyChange,
    balanceAfter: m.balanceAfter,
    reference: m.reference ?? "",
    note: m.note ?? "",
    actor: m.actor,
  });
};

const actorOf = async () => (await getSession())?.role ?? "";

/* ==========================================================================
   Session
   ========================================================================== */

export async function login(passcode: string): Promise<ActionResult<SessionInfo>> {
  return run(async () => {
    const session = await resolvePasscode(String(passcode ?? ""));
    if (!session) fail("Incorrect passcode. Please try again.");
    await writeSession(session!);
    return session!;
  });
}

export async function logout(): Promise<void> {
  await clearSession();
}

export async function currentSession(): Promise<SessionInfo | null> {
  return getSession();
}

/* ==========================================================================
   User accounts (admin only) — Settings → Users
   ========================================================================== */

export type AppUser = { id: string; name: string; role: "admin" | "staff"; modes: Mode[]; active: boolean; created_at: string };

export async function listUsers(): Promise<ActionResult<AppUser[]>> {
  return run(async () => {
    await requireAdmin();
    const rows = await db.select().from(schema.appUsers).orderBy(asc(schema.appUsers.name));
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role === "admin" ? "admin" : "staff",
      modes: parseModes(u.modes),
      active: u.active,
      created_at: u.createdAt.toISOString(),
    }));
  });
}

export async function saveUser(payload: {
  id?: string;
  name: string;
  role: "admin" | "staff";
  modes: Mode[];
  active: boolean;
  /** Required for a new account; blank on edit keeps the current passcode. */
  passcode?: string;
}): Promise<ActionResult<string>> {
  return run(async () => {
    const me = await requireAdmin();
    const name = str(payload.name);
    if (!name) fail("Enter the user's name.");
    const role = payload.role === "admin" ? "admin" : "staff";
    const modes = role === "admin" ? ["retail", "wholesale"] : (payload.modes || []).filter(isMode);
    if (!modes.length) fail("Give the user access to at least one dashboard.");
    const passcode = normalisePasscode(payload.passcode ?? "");
    if (passcode) {
      if (passcode.length < 4) fail("Passcodes need at least 4 characters.");
      if (await isReservedPasscode(passcode)) fail("That passcode is already in use. Choose another.");
    }
    const editing = !isNewId(payload.id);
    if (!editing && !passcode) fail("Set a passcode for the new user.");
    if (editing && payload.id === me.userId && (role !== "admin" || !payload.active))
      fail("You can't remove your own admin access.");

    const values = {
      name,
      role,
      modes: modes.join(","),
      active: Boolean(payload.active),
      ...(passcode && { passcodeHash: hashPasscode(passcode) }),
    };
    try {
      if (editing) {
        const res = await db.update(schema.appUsers).set(values).where(eq(schema.appUsers.id, payload.id!)).returning({ id: schema.appUsers.id });
        if (!res.length) fail("That user no longer exists.");
        return payload.id!;
      }
      const res = await db
        .insert(schema.appUsers)
        .values({ ...values, passcodeHash: hashPasscode(passcode) })
        .returning({ id: schema.appUsers.id });
      return res[0].id;
    } catch (err) {
      if (err instanceof UserError) throw err;
      // Passcodes identify the user at login, so they must be unique.
      if (/unique|duplicate/i.test(String((err as { cause?: unknown })?.cause ?? err))) fail("That passcode is already in use. Choose another.");
      throw err;
    }
  });
}

/* ==========================================================================
   Built-in login passcodes (admin only) — Settings → Login passcodes
   ========================================================================== */

export async function getLoginPasscodeStatus(): Promise<ActionResult<{ admin: boolean; staff: boolean }>> {
  return run(async () => {
    await requireAdmin();
    return builtInPasscodeStatus();
  });
}

/** Reset the shared admin or staff passcode. `passcode: null` goes back to the server's (Vercel) value. */
export async function resetLoginPasscode(payload: {
  role: "admin" | "staff";
  passcode: string | null;
}): Promise<ActionResult<null>> {
  return run(async () => {
    await requireAdmin();
    const role = payload.role === "admin" ? "admin" : "staff";
    if (payload.passcode === null) {
      await setBuiltInPasscode(role, null);
      return null;
    }
    const passcode = normalisePasscode(payload.passcode);
    if (passcode.length < 4) fail("Passcodes need at least 4 characters.");
    // Each passcode must open exactly one login.
    const current = await resolvePasscode(passcode);
    const sameLogin = current && !current.userId && current.role === role;
    if (current && !sameLogin) fail("That passcode is already used by another login. Choose another.");
    const account = await db
      .select({ id: schema.appUsers.id })
      .from(schema.appUsers)
      .where(eq(schema.appUsers.passcodeHash, hashPasscode(passcode)))
      .limit(1);
    if (account.length) fail("That passcode is already used by a user account. Choose another.");
    await setBuiltInPasscode(role, passcode);
    return null;
  });
}

export async function deleteUser(id: string): Promise<ActionResult<null>> {
  return run(async () => {
    const me = await requireAdmin();
    if (id === me.userId) fail("You can't delete your own account.");
    const res = await db.delete(schema.appUsers).where(eq(schema.appUsers.id, id)).returning({ id: schema.appUsers.id });
    if (!res.length) fail("That user no longer exists.");
    return null;
  });
}

/* ==========================================================================
   Shared medicine catalogue
   ========================================================================== */

export async function saveMedicine(mode: Mode, payload: any): Promise<ActionResult<string>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    const genericName = str(payload.generic_name);
    if (!genericName) fail("Enter the medicine (generic) name.");
    const gst = num(payload.gst_percent);
    if (gst < 0 || gst > 28) fail("GST % must be between 0 and 28.");
    const barcode = str(payload.barcode);

    if (barcode) {
      const clash = await db
        .select({ id: schema.medicines.id, name: schema.medicines.genericName })
        .from(schema.medicines)
        .where(eq(schema.medicines.barcode, barcode))
        .limit(1);
      if (clash.length && clash[0].id !== payload.id) fail(`Barcode ${barcode} is already used by ${clash[0].name}.`);
    }

    const shared = {
      genericName,
      salt: str(payload.salt) || genericName,
      schedule: str(payload.schedule) || "OTC",
      productType: str(payload.product_type).slice(0, 40),
      hsnCode: str(payload.hsn_code),
      gstPercent: String(gst),
      purchaseUnitType: str(payload.purchase_unit_type) || "Strip",
      ...(payload.barcode !== undefined && { barcode }),
      ...(payload.wholesale_moq !== undefined && { wholesaleMoq: Math.max(0, int(payload.wholesale_moq)) }),
      ...(payload.low_stock_threshold !== undefined && {
        lowStockThreshold: Math.max(0, int(payload.low_stock_threshold)),
      }),
    };

    if (!isNewId(payload.id)) {
      // Brand name & manufacturer are batch-level; one record serves both dashboards.
      const res = await db
        .update(schema.medicines)
        .set(shared)
        .where(eq(schema.medicines.id, payload.id))
        .returning({ id: schema.medicines.id });
      if (!res.length) fail("That medicine no longer exists.");
      return payload.id as string;
    }

    const res = await db
      .insert(schema.medicines)
      .values({
        ...shared,
        // Kept on insert for legacy display; batches carry the real brand.
        brandName: str(payload.brand_name),
        manufacturer: str(payload.manufacturer),
      })
      .returning({ id: schema.medicines.id });
    return res[0].id;
  });
}

/** Medicines with any stock or sales history are archived, never deleted. */
export async function deleteMedicine(mode: Mode, id: string): Promise<ActionResult<{ archived: boolean }>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    const [batchRef, billRef] = await Promise.all([
      db.select({ id: schema.batches.id }).from(schema.batches).where(eq(schema.batches.medicineId, id)).limit(1),
      db.select({ id: schema.billItems.id }).from(schema.billItems).where(eq(schema.billItems.medicineId, id)).limit(1),
    ]);
    if (batchRef.length || billRef.length) {
      await db.update(schema.medicines).set({ archived: true }).where(eq(schema.medicines.id, id));
      return { archived: true };
    }
    await db.delete(schema.medicines).where(eq(schema.medicines.id, id));
    return { archived: false };
  });
}

export async function restoreMedicine(mode: Mode, id: string): Promise<ActionResult<null>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    await db.update(schema.medicines).set({ archived: false }).where(eq(schema.medicines.id, id));
    return null;
  });
}

/* ==========================================================================
   Suppliers — one shared directory for both modes. Purchases, payments,
   returns and balances against a supplier are recorded per mode.
   ========================================================================== */

export async function saveSupplier(mode: Mode, payload: any): Promise<ActionResult<string>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    const name = str(payload.name);
    if (!name) fail("Enter the supplier name.");
    const values = { name, phone: str(payload.phone), gstin: str(payload.gstin).toUpperCase(), address: str(payload.address) };
    if (!isNewId(payload.id)) {
      const res = await db
        .update(schema.suppliers)
        .set(values)
        .where(eq(schema.suppliers.id, payload.id))
        .returning({ id: schema.suppliers.id });
      if (!res.length) fail("That supplier no longer exists.");
      return payload.id as string;
    }
    const clash = await db
      .select({ id: schema.suppliers.id })
      .from(schema.suppliers)
      .where(sql`lower(${schema.suppliers.name}) = lower(${name})`)
      .limit(1);
    if (clash.length) fail(`${name} is already in the supplier directory.`);
    // mode stays NULL: the directory is shared by retail and wholesale.
    const res = await db.insert(schema.suppliers).values(values).returning({ id: schema.suppliers.id });
    return res[0].id;
  });
}

export async function deleteSupplier(mode: Mode, id: string): Promise<ActionResult<null>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    const [bought, paid, ordered, returned] = await Promise.all([
      db.select({ id: schema.batches.id }).from(schema.batches).where(eq(schema.batches.supplierId, id)).limit(1),
      db.select({ id: schema.payments.id }).from(schema.payments).where(eq(schema.payments.supplierId, id)).limit(1),
      db.select({ id: schema.purchaseOrders.id }).from(schema.purchaseOrders).where(eq(schema.purchaseOrders.supplierId, id)).limit(1),
      db.select({ id: schema.purchaseReturns.id }).from(schema.purchaseReturns).where(eq(schema.purchaseReturns.supplierId, id)).limit(1),
    ]);
    // History in either mode keeps the shared record, so balances never lose their supplier.
    if (bought.length || paid.length || ordered.length || returned.length)
      fail("This supplier has purchase or payment history (retail or wholesale) and can't be deleted.");
    const res = await db.delete(schema.suppliers).where(eq(schema.suppliers.id, id)).returning({ id: schema.suppliers.id });
    if (!res.length) fail("That supplier no longer exists.");
    return null;
  });
}

/* ==========================================================================
   Stock: goods receipt, batch edits, adjustments
   ========================================================================== */

const assertSupplierExists = async (exec: Exec, supplierId: string | null) => {
  if (!supplierId) return;
  const rows = await exec
    .select({ id: schema.suppliers.id })
    .from(schema.suppliers)
    .where(eq(schema.suppliers.id, supplierId))
    .limit(1);
  if (!rows.length) fail("That supplier is no longer in the directory.");
};

/** Goods receipt (new batch) or batch edit. New stock only ever lands in `mode`. */
export async function saveBatch(mode: Mode, payload: any): Promise<ActionResult<string>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    const actor = await actorOf();

    const packSize = int(payload.pack_size);
    const qtyPacks = int(payload.qty_packs);
    const mrp = round2(num(payload.mrp));
    const selling = round2(num(payload.selling_price));
    const rate = round2(num(payload.purchase_rate));
    const stockQty = int(payload.stock_qty);
    if (!str(payload.batch_no)) fail("Enter the batch number.");
    if (!str(payload.exp_date)) fail("Expiry date (EXP DT) is mandatory.");
    if (packSize <= 0) fail("Purchase Unit must be greater than zero.");
    if (qtyPacks < 0 || stockQty < 0) fail("Quantities can't be negative.");
    if (mrp <= 0) fail("Enter the MRP.");
    if (selling <= 0) fail("Enter the selling price.");
    if (selling > mrp) fail("Selling price cannot be higher than the MRP.");
    if (rate < 0) fail("Purchase rate can't be negative.");
    const supplierId = str(payload.supplier_id) || null;

    return db.transaction(async (tx) => {
      await assertSupplierExists(tx, supplierId);
      const med = await tx
        .select({ id: schema.medicines.id })
        .from(schema.medicines)
        .where(eq(schema.medicines.id, payload.medicine_id))
        .limit(1);
      if (!med.length) fail("Pick a medicine from the catalogue.");

      const values = {
        brandName: str(payload.brand_name),
        manufacturer: str(payload.manufacturer),
        invoiceNo: str(payload.invoice_no),
        purchaseDate: isIsoDate(payload.purchase_date) ? payload.purchase_date : today(),
        batchNo: str(payload.batch_no),
        mfgDate: str(payload.mfg_date),
        expDate: str(payload.exp_date),
        box: str(payload.box).toUpperCase(),
        purchaseUnitType: str(payload.purchase_unit_type) || "Strip",
        packSize,
        stripsPerBox: Math.max(0, int(payload.strips_per_box)),
        qtyPacks,
        stockAdded: packSize * qtyPacks,
        purchaseRate: String(rate),
        mrp: String(mrp),
        sellingPrice: String(selling),
        gstPercent: String(num(payload.gst_percent)),
        supplierId,
        medicineId: payload.medicine_id as string,
      };

      if (!isNewId(payload.id)) {
        const before = await tx
          .select({ stockQty: schema.batches.stockQty })
          .from(schema.batches)
          .where(and(eq(schema.batches.id, payload.id), eq(schema.batches.mode, mode)))
          .limit(1);
        if (!before.length) fail("Batch not found in this dashboard.");
        await tx
          .update(schema.batches)
          .set({ ...values, stockQty })
          .where(and(eq(schema.batches.id, payload.id), eq(schema.batches.mode, mode)));
        const diff = stockQty - before[0].stockQty;
        if (diff !== 0) {
          await logMovement(tx, {
            mode,
            batchId: payload.id,
            medicineId: values.medicineId,
            type: "EDIT",
            qtyChange: diff,
            balanceAfter: stockQty,
            note: "Stock corrected in Edit Batch",
            actor,
          });
        }
        return payload.id as string;
      }

      const received = packSize * qtyPacks;
      if (received <= 0) fail("Quantity must be greater than zero.");
      const res = await tx
        .insert(schema.batches)
        .values({ ...values, stockQty: received, mode })
        .returning({ id: schema.batches.id });
      await logMovement(tx, {
        mode,
        batchId: res[0].id,
        medicineId: values.medicineId,
        type: "PURCHASE",
        qtyChange: received,
        balanceAfter: received,
        reference: values.invoiceNo,
        note: "Goods receipt",
        actor,
      });
      return res[0].id;
    });
  });
}

export async function deleteBatch(mode: Mode, id: string): Promise<ActionResult<null>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    const sold = await db.select({ id: schema.billItems.id }).from(schema.billItems).where(eq(schema.billItems.batchId, id)).limit(1);
    if (sold.length) fail("This batch has sales against it. Adjust its stock to zero instead of deleting it.");
    const returned = await db
      .select({ id: schema.purchaseReturns.id })
      .from(schema.purchaseReturns)
      .where(eq(schema.purchaseReturns.batchId, id))
      .limit(1);
    if (returned.length) fail("This batch has purchase returns recorded and can't be deleted.");
    const self = await db.select({ source: schema.batches.sourceBatchId }).from(schema.batches).where(eq(schema.batches.id, id)).limit(1);
    const transferredOut = await db.select({ id: schema.batches.id }).from(schema.batches).where(eq(schema.batches.sourceBatchId, id)).limit(1);
    if (self[0]?.source || transferredOut.length)
      fail("This batch is part of a stock transfer between retail and wholesale. Adjust its stock instead of deleting it.");
    const actor = await actorOf();
    await db.transaction(async (tx) => {
      const res = await tx
        .delete(schema.batches)
        .where(and(eq(schema.batches.id, id), eq(schema.batches.mode, mode)))
        .returning();
      if (!res.length) fail("Batch not found in this dashboard.");
      await logMovement(tx, {
        mode,
        batchId: id,
        medicineId: res[0].medicineId,
        type: "EDIT",
        qtyChange: -res[0].stockQty,
        balanceAfter: 0,
        reference: res[0].batchNo,
        note: "Batch deleted",
        actor,
      });
    });
    return null;
  });
}

/** Damaged / expired write-offs and manual corrections, all recorded in the ledger. */
export async function adjustStock(
  mode: Mode,
  payload: { batch_id: string; type: "DAMAGED" | "EXPIRED" | "ADJUSTMENT"; qty_change: number; note?: string },
): Promise<ActionResult<number>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    const change = int(payload.qty_change);
    if (!change) fail("Enter the quantity to adjust.");
    if (!["DAMAGED", "EXPIRED", "ADJUSTMENT"].includes(payload.type)) fail("Pick a reason for the adjustment.");
    if (payload.type !== "ADJUSTMENT" && change > 0) fail("Damaged and expired stock can only be removed.");
    const actor = await actorOf();
    return db.transaction(async (tx) => {
      const res = await tx
        .update(schema.batches)
        .set({ stockQty: sql`${schema.batches.stockQty} + ${change}` })
        .where(
          and(
            eq(schema.batches.id, payload.batch_id),
            eq(schema.batches.mode, mode),
            gte(schema.batches.stockQty, Math.max(0, -change)),
          ),
        )
        .returning();
      if (!res.length) fail("Not enough stock in this batch for that adjustment.");
      await logMovement(tx, {
        mode,
        batchId: payload.batch_id,
        medicineId: res[0].medicineId,
        type: payload.type,
        qtyChange: change,
        balanceAfter: res[0].stockQty,
        note: str(payload.note),
        actor,
      });
      return res[0].stockQty;
    });
  });
}

/**
 * Move stock between retail and wholesale — the only way stock crosses modes.
 * Admin only, with access to both. In one transaction the units leave the
 * source batch and land in a batch in the other mode that keeps the same
 * batch number, expiry and purchase cost (linked by source_batch_id). The
 * transferred batch records no new purchase, so supplier balances are unchanged.
 */
export async function transferStock(
  from: Mode,
  payload: { batch_id: string; qty: number; selling_price: number; box?: string; note?: string },
): Promise<ActionResult<{ batch_id: string; to: Mode; source_left: number; destination_qty: number }>> {
  return run(async () => {
    const to: Mode = from === "retail" ? "wholesale" : "retail";
    await requireMode(from, { admin: true });
    await requireMode(to, { admin: true });
    const actor = await actorOf();
    const qty = int(payload.qty);
    if (qty <= 0) fail("Enter the number of units to transfer.");
    const selling = round2(num(payload.selling_price));

    return db.transaction(async (tx) => {
      const src = await tx
        .select()
        .from(schema.batches)
        .where(and(eq(schema.batches.id, payload.batch_id), eq(schema.batches.mode, from)))
        .limit(1);
      if (!src.length) fail("Batch not found in this dashboard.");
      const b = src[0];
      if (isExpired(b.expDate)) fail(`Batch ${b.batchNo} has expired and can't be transferred.`);
      if (selling <= 0) fail(`Enter the ${to} selling price per pack.`);
      if (selling > num(b.mrp)) fail("Selling price cannot be higher than the MRP.");

      const out = await tx
        .update(schema.batches)
        .set({ stockQty: sql`${schema.batches.stockQty} - ${qty}` })
        .where(and(eq(schema.batches.id, b.id), eq(schema.batches.mode, from), gte(schema.batches.stockQty, qty)))
        .returning();
      if (!out.length) fail(`Only ${b.stockQty} units left in batch ${b.batchNo}.`);

      // Repeat transfers of the same batch top up the one destination batch.
      const existing = await tx
        .select()
        .from(schema.batches)
        .where(and(eq(schema.batches.sourceBatchId, b.id), eq(schema.batches.mode, to)))
        .limit(1);
      let dest: typeof schema.batches.$inferSelect;
      if (existing.length) {
        const res = await tx
          .update(schema.batches)
          .set({
            stockQty: sql`${schema.batches.stockQty} + ${qty}`,
            stockAdded: sql`${schema.batches.stockAdded} + ${qty}`,
            sellingPrice: String(selling),
            ...(str(payload.box) && { box: str(payload.box).toUpperCase() }),
          })
          .where(eq(schema.batches.id, existing[0].id))
          .returning();
        dest = res[0];
      } else {
        const res = await tx
          .insert(schema.batches)
          .values({
            medicineId: b.medicineId,
            supplierId: b.supplierId,
            brandName: b.brandName,
            manufacturer: b.manufacturer,
            invoiceNo: b.invoiceNo,
            purchaseDate: b.purchaseDate,
            batchNo: b.batchNo,
            mfgDate: b.mfgDate,
            expDate: b.expDate,
            box: str(payload.box).toUpperCase() || b.box,
            purchaseUnitType: b.purchaseUnitType,
            packSize: b.packSize,
            stripsPerBox: b.stripsPerBox,
            qtyPacks: 0, // not a purchase: the supplier was already owed for these on the source side
            stockAdded: qty,
            stockQty: qty,
            purchaseRate: b.purchaseRate,
            mrp: b.mrp,
            sellingPrice: String(selling),
            gstPercent: b.gstPercent,
            mode: to,
            sourceBatchId: b.id,
          })
          .returning();
        dest = res[0];
      }

      const reference = `TRF-${dest.id.slice(0, 8).toUpperCase()}`;
      const note = str(payload.note);
      await logMovement(tx, {
        mode: from,
        batchId: b.id,
        medicineId: b.medicineId,
        type: "TRANSFER_OUT",
        qtyChange: -qty,
        balanceAfter: out[0].stockQty,
        reference,
        note: note || `To ${to} inventory`,
        actor,
      });
      await logMovement(tx, {
        mode: to,
        batchId: dest.id,
        medicineId: b.medicineId,
        type: "TRANSFER_IN",
        qtyChange: qty,
        balanceAfter: dest.stockQty,
        reference,
        note: note || `From ${from} inventory (batch ${b.batchNo})`,
        actor,
      });
      return { batch_id: dest.id, to, source_left: out[0].stockQty, destination_qty: dest.stockQty };
    });
  });
}

export async function adjustBatchStock(mode: Mode, id: string, qty: number): Promise<ActionResult<number>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    const rows = await db
      .select({ stockQty: schema.batches.stockQty })
      .from(schema.batches)
      .where(and(eq(schema.batches.id, id), eq(schema.batches.mode, mode)))
      .limit(1);
    if (!rows.length) fail("Batch not found in this dashboard.");
    const result = await adjustStock(mode, { batch_id: id, type: "ADJUSTMENT", qty_change: int(qty) - rows[0].stockQty });
    if (!result.ok) fail(result.error);
    return (result as { ok: true; data: number }).data;
  });
}

export async function getBatchMovements(mode: Mode, batchId: string): Promise<ActionResult<StockMovement[]>> {
  return run(async () => {
    await requireMode(mode);
    return listStockMovements(mode, batchId);
  });
}

/* ==========================================================================
   Customers (per mode)
   ========================================================================== */

const customerValues = (payload: any) => ({
  name: str(payload.name),
  phone: str(payload.phone),
  address: str(payload.address),
  doctorName: str(payload.doctor_name),
  email: str(payload.email),
  age: str(payload.age),
  gender: str(payload.gender),
  quickBill: Boolean(payload.quick_bill),
  businessType: str(payload.business_type),
  gstin: str(payload.gstin).toUpperCase(),
  contactPerson: str(payload.contact_person),
  dlNo: str(payload.dl_no).toUpperCase(),
  shippingAddress: str(payload.shipping_address),
  creditLimit: String(Math.max(0, round2(num(payload.credit_limit)))),
  creditDays: Math.max(0, int(payload.credit_days)),
  discountPercent: String(Math.min(100, Math.max(0, round2(num(payload.discount_percent))))),
});

export async function saveCustomer(mode: Mode, payload: any): Promise<ActionResult<string>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    const values = customerValues(payload);
    if (!values.name && !values.phone) fail("Enter a name or phone number.");
    if (mode === "wholesale" && !values.name) fail("Enter the business name.");

    if (!isNewId(payload.id)) {
      const res = await db
        .update(schema.customers)
        .set(values)
        .where(and(eq(schema.customers.id, payload.id), eq(schema.customers.mode, mode)))
        .returning({ id: schema.customers.id });
      if (!res.length) fail("Customer not found in this dashboard.");
      return payload.id as string;
    }
    const id = formatCustomerId(await nextVal(db, "customer_seq"), mode);
    await db.insert(schema.customers).values({ id, ...values, mode });
    return id;
  });
}

/**
 * Wholesale billing → "+ New pharmacy". Anyone billing wholesale may add one;
 * only the contact details are taken — credit terms and discounts stay admin-only
 * (Customers screen).
 */
export async function addPharmacyAtBilling(payload: {
  name: string;
  phone?: string;
  gstin?: string;
  address?: string;
}): Promise<ActionResult<string>> {
  return run(async () => {
    await requireMode("wholesale");
    const name = str(payload.name);
    if (!name) fail("Enter the pharmacy name.");
    const phone = str(payload.phone);
    const gstin = str(payload.gstin).toUpperCase();
    const dupe = await db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.mode, "wholesale"),
          phone ? eq(schema.customers.phone, phone) : sql`lower(${schema.customers.name}) = ${name.toLowerCase()}`,
        ),
      )
      .limit(1);
    if (dupe.length) fail(`This pharmacy is already saved as ${dupe[0].id} — search for it instead.`);
    const id = formatCustomerId(await nextVal(db, "customer_seq"), "wholesale");
    await db.insert(schema.customers).values({
      id,
      ...customerValues({ name, phone, gstin, address: str(payload.address), business_type: "Medical Shop" }),
      mode: "wholesale",
    });
    return id;
  });
}

export async function deleteCustomer(mode: Mode, id: string): Promise<ActionResult<null>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    const owing = await db
      .select({ due: sql<string>`coalesce(sum(${schema.bills.dueAmount}), 0)` })
      .from(schema.bills)
      .where(and(eq(schema.bills.customerId, id), eq(schema.bills.mode, mode)));
    if (num(owing[0]?.due) > 0) fail("This customer still has an outstanding balance.");
    const res = await db
      .delete(schema.customers)
      .where(and(eq(schema.customers.id, id), eq(schema.customers.mode, mode)))
      .returning({ id: schema.customers.id });
    if (!res.length) fail("Customer not found in this dashboard.");
    return null;
  });
}

/* ==========================================================================
   Settings
   ========================================================================== */

/**
 * Settings → Shop Details. Shop identity, GSTIN / drug licence and the stock &
 * tax defaults belong to the current billing mode (retail and wholesale each
 * print their own); logo, colour theme and Instagram are shared.
 */
export async function saveSettings(mode: Mode, payload: any): Promise<ActionResult<null>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    const gstin = str(payload.gstin).toUpperCase().replace(/\s/g, "");
    if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) fail("GSTIN must be 15 letters and numbers.");
    const gst = num(payload.default_gst ?? 12);
    if (gst < 0 || gst > 28) fail("Default GST % must be between 0 and 28.");

    const modeValues = {
      shopName: str(payload.shop_name),
      fullName: str(payload.full_name),
      address: str(payload.address),
      phone: str(payload.phone),
      shopContactNumber: str(payload.shop_contact_number),
      email: str(payload.email),
      gstin,
      dlNo: str(payload.dl_no).toUpperCase().slice(0, 60),
      defaultGst: String(gst),
      lowStockThreshold: Math.max(0, int(payload.low_stock_threshold ?? 20)),
      expiryAlertMonths: Math.max(0, int(payload.expiry_alert_months ?? 6)),
    };
    await db.transaction(async (tx) => {
      await tx
        .update(schema.settings)
        .set({
          colourTheme: payload.colour_theme || "nalam",
          logo: payload.logo || "",
          useCustomLogo: Boolean(payload.use_custom_logo),
          instagramId: payload.instagram_id || "",
        })
        .where(eq(schema.settings.id, 1));
      await tx
        .insert(schema.modeSettings)
        .values({ mode, ...modeValues })
        .onConflictDoUpdate({ target: schema.modeSettings.mode, set: modeValues });
    });
    return null;
  });
}

const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Bank Transfer", "Cheque", "Credit"];

export async function saveModeSettings(mode: Mode, payload: any): Promise<ActionResult<null>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    const prefix = str(payload.invoice_prefix).toUpperCase();
    if (!/^[A-Z0-9/-]{0,8}$/.test(prefix)) fail("Invoice prefix can only use letters, numbers, / and - (max 8).");
    const other: Mode = mode === "retail" ? "wholesale" : "retail";
    const otherSettings = await getModeSettings(other);
    if (otherSettings.invoice_prefix === prefix)
      fail("Retail and wholesale need different invoice prefixes so invoice numbers never clash.");

    const methods = (Array.isArray(payload.payment_methods) ? payload.payment_methods : [])
      .map(str)
      .filter((m: string) => PAYMENT_METHODS.includes(m));
    if (!methods.filter((m: string) => m !== "Credit").length) fail("Keep at least one payment method other than Credit.");
    const allowCredit = Boolean(payload.allow_credit);
    if (allowCredit && !methods.includes("Credit")) methods.push("Credit");
    const finalMethods = allowCredit ? methods : methods.filter((m: string) => m !== "Credit");

    const tiers = (Array.isArray(payload.bulk_discount_tiers) ? payload.bulk_discount_tiers : [])
      .map((t: any) => ({ min_packs: int(t.min_packs), percent: round2(num(t.percent)) }))
      .filter((t: { min_packs: number; percent: number }) => t.min_packs > 0 && t.percent > 0 && t.percent < 100);

    const offers = (Array.isArray(payload.bill_offers) ? payload.bill_offers : [])
      .map((o: any) => ({ min_amount: round2(num(o.min_amount)), percent: round2(num(o.percent)) }))
      .filter((o: { min_amount: number; percent: number }) => o.min_amount > 0 || o.percent > 0);
    for (const o of offers as { min_amount: number; percent: number }[]) {
      if (o.min_amount <= 0) fail("Each bill offer needs a minimum bill amount above ₹0.");
      if (o.percent <= 0 || o.percent >= 100) fail("Each bill offer's discount must be between 0% and 100%.");
    }
    if (new Set(offers.map((o: { min_amount: number }) => o.min_amount)).size !== offers.length)
      fail("Two bill offers have the same minimum amount — keep one.");

    const values = {
      invoicePrefix: prefix,
      paymentMethods: finalMethods.join(","),
      allowCredit,
      defaultCreditDays: Math.max(0, int(payload.default_credit_days)),
      maxDiscountPercent: String(Math.min(100, Math.max(0, round2(num(payload.max_discount_percent))))),
      bulkDiscountTiers: JSON.stringify(tiers),
      billOffers: JSON.stringify(offers),
      enforceMoq: Boolean(payload.enforce_moq),
      invoiceTerms: String(payload.invoice_terms ?? "").slice(0, 1000),
    };
    await db
      .insert(schema.modeSettings)
      .values({ mode, ...values })
      .onConflictDoUpdate({ target: schema.modeSettings.mode, set: values });
    return null;
  });
}

/** Settings → Product Types: the list offered when adding / editing medicines (shared by both dashboards). */
export async function saveProductTypes(types: string[]): Promise<ActionResult<string[]>> {
  return run(async () => {
    await requireAdmin();
    const list = parseProductTypes(Array.isArray(types) ? types : []);
    if (!list.length) fail("Keep at least one product type.");
    if (list.length > 40) fail("Keep the list to 40 product types or fewer.");
    await db.update(schema.settings).set({ productTypes: JSON.stringify(list) }).where(eq(schema.settings.id, 1));
    return list;
  });
}

/** Settings → Purchase Units: the units a batch can be bought in (shared by both dashboards). */
export async function savePurchaseUnits(units: string[]): Promise<ActionResult<string[]>> {
  return run(async () => {
    await requireAdmin();
    const list = parsePurchaseUnits(Array.isArray(units) ? units : []);
    if (!list.length) fail("Keep at least one purchase unit.");
    if (list.length > 40) fail("Keep the list to 40 purchase units or fewer.");
    await db.update(schema.settings).set({ purchaseUnits: JSON.stringify(list) }).where(eq(schema.settings.id, 1));
    return list;
  });
}

/** Settings → Product-type Discounts: automatic % off by product type, applied when bills are saved. */
export async function saveTypeDiscounts(mode: Mode, payload: unknown): Promise<ActionResult<null>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    const rules = normaliseTypeDiscounts(payload);
    for (const rule of rules)
      for (let i = 1; i < rule.bands.length; i += 1) {
        const prev = rule.bands[i - 1];
        if (prev.to === 0 || prev.to > rule.bands[i].from)
          fail(`${rule.type}: the bands overlap — each amount must fall in exactly one band.`);
      }
    const values = { typeDiscounts: JSON.stringify(rules) };
    await db
      .insert(schema.modeSettings)
      .values({ mode, ...values })
      .onConflictDoUpdate({ target: schema.modeSettings.mode, set: values });
    return null;
  });
}

/** Settings → Invoice Offer Pop-up: what customers see when they open their invoice link. */
export async function saveInvoicePromo(mode: Mode, payload: unknown): Promise<ActionResult<null>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    const promo = normalisePromo(payload);
    if (promo.enabled && !promo.title && !promo.groups.length) fail("Add a title or at least one offer before switching the pop-up on.");
    const values = { invoicePromo: JSON.stringify(promo) };
    await db
      .insert(schema.modeSettings)
      .values({ mode, ...values })
      .onConflictDoUpdate({ target: schema.modeSettings.mode, set: values });
    return null;
  });
}

/* ==========================================================================
   Billing
   ========================================================================== */

type BillLineInput = { batch_id: string; qty: number; per_unit_price: number };

export async function submitBill(
  mode: Mode,
  payload: {
    /** Random id from the billing screen — repeats return the first bill. */
    client_ref?: string;
    customer_id: string | null;
    customer_name: string;
    customer_phone: string;
    customer_address: string;
    doctor_name: string;
    customer_email?: string;
    customer_age?: string;
    customer_gender?: string;
    prescription_no?: string;
    billed_by?: string;
    txn_ref?: string;
    /** Flat discount given at the counter on top of the per-line discounts */
    extra_discount?: number;
    received_amount: number;
    payment_method: string;
    bill_date?: string;
    shipping_address?: string;
    lines: BillLineInput[];
  },
): Promise<ActionResult<string>> {
  return run(async () => {
    await requireMode(mode);
    const actor = await actorOf();
    const settings = await getModeSettings(mode);
    const clientRef = str(payload.client_ref) || null;

    const method = str(payload.payment_method);
    if (!settings.payment_methods.includes(method as never)) fail(`${method || "That payment method"} is not enabled for this dashboard.`);
    const isCredit = method === "Credit";
    if (isCredit && !settings.allow_credit) fail("Credit sales are switched off for this dashboard.");

    // Merge repeated lines for the same batch + price so stock is checked once per batch.
    const merged = new Map<string, BillLineInput>();
    for (const line of payload.lines || []) {
      const qty = int(line.qty);
      const price = round2(num(line.per_unit_price));
      if (!line.batch_id || qty <= 0) fail("Every line needs a quantity greater than zero.");
      if (price <= 0) fail("Every line needs a price greater than zero.");
      const key = `${line.batch_id}|${price}`;
      const prev = merged.get(key);
      merged.set(key, { batch_id: line.batch_id, qty: (prev?.qty || 0) + qty, per_unit_price: price });
    }
    const lines = [...merged.values()];
    if (!lines.length) fail("Add at least one medicine to the bill.");

    const email = str(payload.customer_email);
    const age = str(payload.customer_age);
    const gender = str(payload.customer_gender);
    // The counter's local date can be a day ahead of the server's UTC date (IST after midnight).
    const billDate = isIsoDate(payload.bill_date) && payload.bill_date <= addDays(today(), 1) ? payload.bill_date : today();

    return db.transaction(async (tx) => {
      if (clientRef) {
        const existing = await tx
          .select({ id: schema.bills.id, mode: schema.bills.mode })
          .from(schema.bills)
          .where(eq(schema.bills.clientRef, clientRef))
          .limit(1);
        if (existing.length) {
          if (existing[0].mode !== mode) fail("That bill belongs to the other dashboard.");
          return existing[0].id;
        }
      }

      /* ------------------------------ customer ------------------------------ */
      let customer: typeof schema.customers.$inferSelect | null = null;
      if (payload.customer_id) {
        const rows = await tx
          .select()
          .from(schema.customers)
          .where(and(eq(schema.customers.id, payload.customer_id), eq(schema.customers.mode, mode)))
          .limit(1);
        if (!rows.length) fail("That customer belongs to the other dashboard or no longer exists.");
        customer = rows[0];
        // A picked customer keeps whatever extra details were typed at checkout.
        if (email || age || gender) {
          await tx
            .update(schema.customers)
            .set({ ...(email && { email }), ...(age && { age }), ...(gender && { gender }) })
            .where(eq(schema.customers.id, customer.id));
        }
      } else if (mode === "wholesale") {
        fail("Select the business customer for this wholesale bill.");
      } else if (str(payload.customer_name) || str(payload.customer_phone)) {
        const phone = str(payload.customer_phone);
        const existing = phone
          ? await tx
              .select()
              .from(schema.customers)
              .where(and(eq(schema.customers.phone, phone), eq(schema.customers.mode, mode)))
              .limit(1)
          : [];
        if (existing.length) {
          customer = existing[0];
          await tx
            .update(schema.customers)
            .set({
              ...(str(payload.customer_name) && { name: str(payload.customer_name) }),
              ...(str(payload.customer_address) && { address: str(payload.customer_address) }),
              ...(str(payload.doctor_name) && { doctorName: str(payload.doctor_name) }),
              ...(email && { email }),
              ...(age && { age }),
              ...(gender && { gender }),
            })
            .where(eq(schema.customers.id, customer.id));
        } else {
          const id = formatCustomerId(await nextVal(tx, "customer_seq"), mode);
          const inserted = await tx
            .insert(schema.customers)
            .values({
              id,
              name: str(payload.customer_name) || "Walk-in",
              phone,
              address: str(payload.customer_address),
              doctorName: str(payload.doctor_name),
              email,
              age,
              gender,
              quickBill: true,
              mode,
            })
            .returning();
          customer = inserted[0];
        }
      }
      if (isCredit && !customer) fail("Pick or enter a customer for a credit sale.");

      /* -------------------- stock: deduct atomically per batch -------------------- */
      const priced: {
        batch: typeof schema.batches.$inferSelect;
        med: typeof schema.medicines.$inferSelect;
        qty: number;
        perUnit: number;
        mrpPerUnit: number;
        costPerUnit: number;
      }[] = [];
      const packsByMedicine = new Map<string, number>();

      for (const line of lines) {
        const current = await tx
          .select()
          .from(schema.batches)
          .where(and(eq(schema.batches.id, line.batch_id), eq(schema.batches.mode, mode)))
          .limit(1);
        if (!current.length) fail("A batch on this bill isn't in this dashboard's inventory.");
        const b = current[0];
        if (isExpired(b.expDate)) fail(`Batch ${b.batchNo} has expired and can't be sold.`);
        const packSize = b.packSize || 1;
        const mrpPerUnit = round2(num(b.mrp) / packSize);
        if (line.per_unit_price > mrpPerUnit + 0.01)
          fail(`Price for batch ${b.batchNo} is above its MRP (₹${mrpPerUnit} per unit).`);

        const updated = await tx
          .update(schema.batches)
          .set({ stockQty: sql`${schema.batches.stockQty} - ${line.qty}` })
          .where(and(eq(schema.batches.id, b.id), eq(schema.batches.mode, mode), gte(schema.batches.stockQty, line.qty)))
          .returning();
        if (!updated.length) fail(`Only ${b.stockQty} units left in batch ${b.batchNo}.`);

        const med = await tx.select().from(schema.medicines).where(eq(schema.medicines.id, b.medicineId)).limit(1);
        priced.push({
          batch: updated[0],
          med: med[0],
          qty: line.qty,
          perUnit: line.per_unit_price,
          mrpPerUnit,
          costPerUnit: round2(num(b.purchaseRate) / packSize),
        });
        packsByMedicine.set(b.medicineId, (packsByMedicine.get(b.medicineId) || 0) + line.qty / packSize);
      }

      if (mode === "wholesale" && settings.enforce_moq) {
        for (const p of priced) {
          const moq = p.med.wholesaleMoq || 0;
          const packs = packsByMedicine.get(p.med.id) || 0;
          if (moq > 0 && packs < moq) fail(`${p.med.genericName} needs a minimum order of ${moq} packs.`);
        }
      }

      /* ------------------------------- totals ------------------------------- */
      const totals = calcBillTotals(
        priced.map((p) => ({ qty: p.qty, mrp_per_unit: p.mrpPerUnit, per_unit_price: p.perUnit, gst_percent: num(p.batch.gstPercent) })),
      );
      // Product-type discounts and bill offers come from the saved settings, never from the counter.
      const typeDiscount = calcTypeDiscounts(
        settings.type_discounts,
        priced.map((p) => ({ product_type: p.med.productType, amount: round2(p.perUnit * p.qty) })),
      ).total;
      const afterType = round2(totals.grandTotal - typeDiscount);
      const offerDiscount = calcBillOffer(settings.bill_offers, afterType).discount;
      const afterOffer = round2(afterType - offerDiscount);
      const extraDiscount = Math.min(Math.max(0, round2(num(payload.extra_discount))), afterOffer);
      if (settings.max_discount_percent > 0 && extraDiscount > round2((totals.grandTotal * settings.max_discount_percent) / 100) + 0.01)
        fail(`The extra discount can't be more than ${settings.max_discount_percent}% of the bill.`);
      const grandTotal = round2(afterOffer - extraDiscount);
      const received = Math.max(0, round2(num(payload.received_amount)));

      let paid = grandTotal;
      let due = 0;
      let dueDate: string | null = null;
      if (isCredit) {
        paid = Math.min(received, grandTotal);
        due = round2(grandTotal - paid);
        dueDate = addDays(billDate, customer!.creditDays || settings.default_credit_days || 0);
        const limit = num(customer!.creditLimit);
        if (limit > 0 && due > 0) {
          const owing = await tx
            .select({ due: sql<string>`coalesce(sum(${schema.bills.dueAmount}), 0)` })
            .from(schema.bills)
            .where(and(eq(schema.bills.customerId, customer!.id), eq(schema.bills.mode, mode)));
          const outstanding = num(owing[0]?.due);
          if (outstanding + due > limit + 0.01)
            fail(`Credit limit exceeded: ₹${outstanding.toFixed(2)} already due, limit ₹${limit.toFixed(2)}.`);
        }
      }

      // Each dashboard numbers its own invoices from its own Postgres sequence,
      // so parallel checkouts can't collide on the same id.
      // Skip any number already taken (e.g. after a prefix change or imported bills).
      let billId = "";
      for (let attempt = 0; attempt < 1000 && !billId; attempt += 1) {
        const candidate = formatBillId(await nextVal(tx, mode === "wholesale" ? "wholesale_bill_seq" : "bill_seq"), settings.invoice_prefix);
        const taken = await tx.select({ id: schema.bills.id }).from(schema.bills).where(eq(schema.bills.id, candidate)).limit(1);
        if (!taken.length) billId = candidate;
      }
      if (!billId) fail("Could not allocate an invoice number. Check the invoice prefix in Settings.");

      await tx.insert(schema.bills).values({
        id: billId,
        mode,
        clientRef,
        customerId: customer?.id ?? null,
        customerName: customer ? (str(payload.customer_name) || customer.name) : str(payload.customer_name),
        customerPhone: customer ? (str(payload.customer_phone) || customer.phone) : str(payload.customer_phone),
        customerAddress: customer ? (str(payload.customer_address) || customer.address) : str(payload.customer_address),
        doctorName: str(payload.doctor_name),
        customerEmail: email,
        customerAge: age,
        customerGender: gender,
        customerGstin: customer?.gstin ?? "",
        shippingAddress: str(payload.shipping_address) || customer?.shippingAddress || "",
        prescriptionNo: str(payload.prescription_no),
        billedBy: str(payload.billed_by),
        txnRef: str(payload.txn_ref),
        billDate,
        subTotal: totals.subTotal.toString(),
        discount: round2(totals.discount + typeDiscount + offerDiscount + extraDiscount).toString(),
        taxableAmount: totals.taxableAmount.toString(),
        gstAmount: totals.gstAmount.toString(),
        gstPercent: totals.gstPercent.toString(),
        grandTotal: grandTotal.toString(),
        receivedAmount: received.toString(),
        changeAmount: round2(received - grandTotal).toString(),
        paymentMethod: method,
        paidAmount: paid.toString(),
        dueAmount: due.toString(),
        dueDate,
        status: "COMPLETED",
      });

      for (const p of priced) {
        const lineMrp = round2(p.mrpPerUnit * p.qty);
        const lineAmount = round2(p.perUnit * p.qty);
        await tx.insert(schema.billItems).values({
          billId,
          medicineId: p.med.id,
          batchId: p.batch.id,
          genericName: p.med.genericName,
          brandName: p.batch.brandName || p.med.brandName,
          manufacturer: p.batch.manufacturer || p.med.manufacturer,
          schedule: p.med.schedule,
          productType: p.med.productType,
          hsnCode: p.med.hsnCode,
          batchNo: p.batch.batchNo,
          mfgDate: p.batch.mfgDate,
          expDate: p.batch.expDate,
          box: p.batch.box,
          purchaseUnitType: p.batch.purchaseUnitType,
          packSize: p.batch.packSize,
          qty: p.qty,
          mrpPerUnit: p.mrpPerUnit.toString(),
          perUnitPrice: p.perUnit.toString(),
          lineMrp: lineMrp.toString(),
          lineAmount: lineAmount.toString(),
          lineDiscount: round2(lineMrp - lineAmount).toString(),
          gstPercent: p.batch.gstPercent,
          costPerUnit: p.costPerUnit.toString(),
        });
        await logMovement(tx, {
          mode,
          batchId: p.batch.id,
          medicineId: p.med.id,
          type: "SALE",
          qtyChange: -p.qty,
          balanceAfter: p.batch.stockQty,
          reference: billId,
          actor,
        });
      }

      // Part-payment on a credit bill is recorded as a receipt in the customer's ledger.
      if (isCredit && paid > 0 && customer) {
        await tx.insert(schema.payments).values({
          mode,
          partyType: "customer",
          customerId: customer.id,
          billId,
          amount: paid.toString(),
          method: "Cash",
          note: "Paid at checkout",
          paidOn: billDate,
        });
      }

      return billId;
    });
  });
}

/** Void a bill (admin): stock not already returned goes back to the batches it came from. */
export async function deleteBill(mode: Mode, billId: string): Promise<ActionResult<null>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    const actor = await actorOf();
    await db.transaction(async (tx) => {
      const bill = await tx
        .select()
        .from(schema.bills)
        .where(and(eq(schema.bills.id, billId), eq(schema.bills.mode, mode)))
        .limit(1);
      if (!bill.length) fail("Bill not found in this dashboard.");
      const returns = await tx
        .select({ id: schema.salesReturns.id })
        .from(schema.salesReturns)
        .where(eq(schema.salesReturns.billId, billId))
        .limit(1);
      if (returns.length) fail("This bill has returns recorded against it and can't be deleted.");

      const items = await tx.select().from(schema.billItems).where(eq(schema.billItems.billId, billId));
      for (const item of items) {
        const back = item.qty - item.returnedQty;
        if (!item.batchId || back <= 0) continue;
        const res = await tx
          .update(schema.batches)
          .set({ stockQty: sql`${schema.batches.stockQty} + ${back}` })
          .where(and(eq(schema.batches.id, item.batchId), eq(schema.batches.mode, mode)))
          .returning();
        if (res.length) {
          await logMovement(tx, {
            mode,
            batchId: item.batchId,
            medicineId: res[0].medicineId,
            type: "SALE_VOID",
            qtyChange: back,
            balanceAfter: res[0].stockQty,
            reference: billId,
            note: "Bill deleted",
            actor,
          });
        }
      }
      await tx.delete(schema.payments).where(and(eq(schema.payments.billId, billId), eq(schema.payments.mode, mode)));
      await tx.delete(schema.bills).where(eq(schema.bills.id, billId));
    });
    return null;
  });
}

/* ==========================================================================
   Sales returns
   ========================================================================== */

export async function createSalesReturn(
  mode: Mode,
  payload: { bill_id: string; items: { bill_item_id: string; qty: number }[]; refund_method?: string; reason?: string },
): Promise<ActionResult<{ id: string; amount: number; refund: number; adjusted: number }>> {
  return run(async () => {
    await requireMode(mode);
    const actor = await actorOf();
    const wanted = (payload.items || []).map((i) => ({ id: i.bill_item_id, qty: int(i.qty) })).filter((i) => i.qty > 0);
    if (!wanted.length) fail("Enter the quantity being returned.");

    return db.transaction(async (tx) => {
      const billRows = await tx
        .select()
        .from(schema.bills)
        .where(and(eq(schema.bills.id, payload.bill_id), eq(schema.bills.mode, mode)))
        .limit(1);
      if (!billRows.length) fail("Bill not found in this dashboard.");
      const bill = billRows[0];
      const items = await tx.select().from(schema.billItems).where(eq(schema.billItems.billId, bill.id));
      const linesTotal = items.reduce((s, i) => s + num(i.lineAmount), 0);
      // Spread any counter discount across the lines so refunds match what was paid.
      const factor = linesTotal > 0 ? num(bill.grandTotal) / linesTotal : 1;

      let amount = 0;
      const returned: { bill_item_id: string; batch_id: string; generic_name: string; batch_no: string; qty: number; amount: number }[] = [];
      for (const w of wanted) {
        const item = items.find((i) => i.id === w.id);
        if (!item) fail("That item is not on this bill.");
        const bump = await tx
          .update(schema.billItems)
          .set({ returnedQty: sql`${schema.billItems.returnedQty} + ${w.qty}` })
          .where(
            and(
              eq(schema.billItems.id, item!.id),
              sql`${schema.billItems.returnedQty} + ${w.qty} <= ${schema.billItems.qty}`,
            ),
          )
          .returning();
        if (!bump.length) fail(`Only ${item!.qty - item!.returnedQty} of ${item!.genericName} can still be returned.`);
        if (!item!.batchId) fail(`${item!.genericName} has no batch to return stock to.`);

        const stock = await tx
          .update(schema.batches)
          .set({ stockQty: sql`${schema.batches.stockQty} + ${w.qty}` })
          .where(and(eq(schema.batches.id, item!.batchId!), eq(schema.batches.mode, mode)))
          .returning();
        if (!stock.length) fail(`Batch ${item!.batchNo} is no longer in this dashboard's inventory.`);

        const value = round2(num(item!.perUnitPrice) * w.qty * factor);
        amount = round2(amount + value);
        returned.push({
          bill_item_id: item!.id,
          batch_id: item!.batchId!,
          generic_name: item!.genericName,
          batch_no: item!.batchNo,
          qty: w.qty,
          amount: value,
        });
        await logMovement(tx, {
          mode,
          batchId: item!.batchId!,
          medicineId: stock[0].medicineId,
          type: "SALE_RETURN",
          qtyChange: w.qty,
          balanceAfter: stock[0].stockQty,
          reference: bill.id,
          note: str(payload.reason),
          actor,
        });
      }

      // A return first clears what the customer still owes on the bill; the rest is refunded.
      const adjusted = Math.min(num(bill.dueAmount), amount);
      const refund = round2(amount - adjusted);
      await tx
        .update(schema.bills)
        .set({
          dueAmount: String(round2(num(bill.dueAmount) - adjusted)),
          returnedAmount: String(round2(num(bill.returnedAmount) + amount)),
        })
        .where(eq(schema.bills.id, bill.id));
      const saved = await tx.insert(schema.salesReturns).values({
        mode,
        billId: bill.id,
        customerId: bill.customerId,
        items: JSON.stringify(returned),
        amount: String(amount),
        adjustedAgainstDue: String(round2(adjusted)),
        refundAmount: String(refund),
        refundMethod: str(payload.refund_method) || "Cash",
        reason: str(payload.reason),
      }).returning({ id: schema.salesReturns.id });
      return { id: saved[0].id, amount, refund, adjusted: round2(adjusted) };
    });
  });
}

/* ==========================================================================
   Payments
   ========================================================================== */

export async function recordCustomerPayment(
  mode: Mode,
  payload: { customer_id: string; bill_id?: string; amount: number; method: string; reference?: string; note?: string; paid_on?: string },
): Promise<ActionResult<number>> {
  return run(async () => {
    await requireMode(mode);
    const amount = round2(num(payload.amount));
    if (amount <= 0) fail("Enter the amount received.");
    const paidOn = isIsoDate(payload.paid_on) ? payload.paid_on : today();

    return db.transaction(async (tx) => {
      const cust = await tx
        .select({ id: schema.customers.id })
        .from(schema.customers)
        .where(and(eq(schema.customers.id, payload.customer_id), eq(schema.customers.mode, mode)))
        .limit(1);
      if (!cust.length) fail("Customer not found in this dashboard.");

      const open = await tx
        .select()
        .from(schema.bills)
        .where(
          and(
            eq(schema.bills.customerId, payload.customer_id),
            eq(schema.bills.mode, mode),
            sql`${schema.bills.dueAmount} > 0`,
            ...(payload.bill_id ? [eq(schema.bills.id, payload.bill_id)] : []),
          ),
        )
        .orderBy(asc(schema.bills.billDate), asc(schema.bills.createdAt));
      const outstanding = round2(open.reduce((s, b) => s + num(b.dueAmount), 0));
      if (!open.length) fail("Nothing is outstanding for this customer.");
      if (amount > outstanding + 0.001) fail(`Only ₹${outstanding.toFixed(2)} is outstanding.`);

      // Oldest bills are settled first.
      let left = amount;
      for (const bill of open) {
        if (left <= 0) break;
        const part = round2(Math.min(left, num(bill.dueAmount)));
        await tx
          .update(schema.bills)
          .set({
            dueAmount: String(round2(num(bill.dueAmount) - part)),
            paidAmount: String(round2(num(bill.paidAmount) + part)),
          })
          .where(eq(schema.bills.id, bill.id));
        await tx.insert(schema.payments).values({
          mode,
          partyType: "customer",
          customerId: payload.customer_id,
          billId: bill.id,
          amount: String(part),
          method: str(payload.method) || "Cash",
          reference: str(payload.reference),
          note: str(payload.note),
          paidOn,
        });
        left = round2(left - part);
      }
      return round2(outstanding - amount);
    });
  });
}

/** What this dashboard owes a supplier: stock received at purchase rate, less payments and returns. */
const supplierOutstanding = async (exec: Exec, mode: Mode, supplierId: string) => {
  const [bought, paid, returned] = await Promise.all([
    exec
      .select({ v: sql<string>`coalesce(sum(${schema.batches.purchaseRate} * ${schema.batches.qtyPacks}), 0)` })
      .from(schema.batches)
      .where(and(eq(schema.batches.supplierId, supplierId), eq(schema.batches.mode, mode))),
    exec
      .select({ v: sql<string>`coalesce(sum(${schema.payments.amount}), 0)` })
      .from(schema.payments)
      .where(and(eq(schema.payments.supplierId, supplierId), eq(schema.payments.mode, mode))),
    exec
      .select({ v: sql<string>`coalesce(sum(${schema.purchaseReturns.amount}), 0)` })
      .from(schema.purchaseReturns)
      .where(and(eq(schema.purchaseReturns.supplierId, supplierId), eq(schema.purchaseReturns.mode, mode))),
  ]);
  return round2(num(bought[0]?.v) - num(paid[0]?.v) - num(returned[0]?.v));
};

export async function recordSupplierPayment(
  mode: Mode,
  payload: { supplier_id: string; invoice_no?: string; amount: number; method: string; reference?: string; note?: string; paid_on?: string },
): Promise<ActionResult<number>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    const amount = round2(num(payload.amount));
    if (amount <= 0) fail("Enter the amount paid.");
    return db.transaction(async (tx) => {
      await assertSupplierExists(tx, payload.supplier_id);
      if (!payload.supplier_id) fail("Pick a supplier.");
      const outstanding = await supplierOutstanding(tx, mode, payload.supplier_id);
      if (amount > outstanding + 0.001) fail(`Only ₹${Math.max(0, outstanding).toFixed(2)} is outstanding to this supplier.`);
      await tx.insert(schema.payments).values({
        mode,
        partyType: "supplier",
        supplierId: payload.supplier_id,
        invoiceNo: str(payload.invoice_no),
        amount: String(amount),
        method: str(payload.method) || "Cash",
        reference: str(payload.reference),
        note: str(payload.note),
        paidOn: isIsoDate(payload.paid_on) ? payload.paid_on : today(),
      });
      return round2(outstanding - amount);
    });
  });
}

/* ==========================================================================
   Purchase returns & purchase orders
   ========================================================================== */

export async function createPurchaseReturn(
  mode: Mode,
  payload: { batch_id: string; qty: number; amount?: number; reason?: string },
): Promise<ActionResult<null>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    const qty = int(payload.qty);
    if (qty <= 0) fail("Enter the quantity being returned.");
    const actor = await actorOf();
    await db.transaction(async (tx) => {
      const res = await tx
        .update(schema.batches)
        .set({ stockQty: sql`${schema.batches.stockQty} - ${qty}` })
        .where(and(eq(schema.batches.id, payload.batch_id), eq(schema.batches.mode, mode), gte(schema.batches.stockQty, qty)))
        .returning();
      if (!res.length) fail("Not enough stock in this batch to return that quantity.");
      const b = res[0];
      const med = await tx.select({ name: schema.medicines.genericName }).from(schema.medicines).where(eq(schema.medicines.id, b.medicineId)).limit(1);
      const value =
        payload.amount !== undefined && num(payload.amount) > 0
          ? round2(num(payload.amount))
          : round2((num(b.purchaseRate) / (b.packSize || 1)) * qty);
      await tx.insert(schema.purchaseReturns).values({
        mode,
        supplierId: b.supplierId,
        batchId: b.id,
        medicineId: b.medicineId,
        genericName: med[0]?.name ?? "",
        batchNo: b.batchNo,
        qty,
        amount: String(value),
        reason: str(payload.reason),
      });
      await logMovement(tx, {
        mode,
        batchId: b.id,
        medicineId: b.medicineId,
        type: "PURCHASE_RETURN",
        qtyChange: -qty,
        balanceAfter: b.stockQty,
        reference: b.invoiceNo,
        note: str(payload.reason),
        actor,
      });
    });
    return null;
  });
}

export async function savePurchaseOrder(
  mode: Mode,
  payload: { id?: string; supplier_id: string; order_date?: string; expected_date?: string; items: PurchaseOrderItem[]; notes?: string },
): Promise<ActionResult<string>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    if (!payload.supplier_id) fail("Pick a supplier for the order.");
    await assertSupplierExists(db, payload.supplier_id);
    const items = (payload.items || [])
      .map((i) => ({
        medicine_id: str(i.medicine_id),
        generic_name: str(i.generic_name),
        packs: int(i.packs),
        pack_size: Math.max(1, int(i.pack_size)),
        rate: round2(num(i.rate)),
      }))
      .filter((i) => i.medicine_id && i.packs > 0);
    if (!items.length) fail("Add at least one medicine with a quantity.");
    const ids = [...new Set(items.map((i) => i.medicine_id))];
    const known = await db.select({ id: schema.medicines.id }).from(schema.medicines).where(inArray(schema.medicines.id, ids));
    if (known.length !== ids.length) fail("One of the medicines is no longer in the catalogue.");

    const values = {
      supplierId: payload.supplier_id,
      orderDate: isIsoDate(payload.order_date) ? payload.order_date : today(),
      expectedDate: isIsoDate(payload.expected_date) ? payload.expected_date : null,
      items: JSON.stringify(items),
      notes: str(payload.notes),
    };
    if (!isNewId(payload.id)) {
      const res = await db
        .update(schema.purchaseOrders)
        .set(values)
        .where(and(eq(schema.purchaseOrders.id, payload.id!), eq(schema.purchaseOrders.mode, mode), eq(schema.purchaseOrders.status, "ORDERED")))
        .returning({ id: schema.purchaseOrders.id });
      if (!res.length) fail("Only open purchase orders in this dashboard can be edited.");
      return payload.id!;
    }
    const poNo = formatPoNumber(await nextVal(db, "purchase_order_seq"), mode);
    const res = await db.insert(schema.purchaseOrders).values({ ...values, mode, poNo }).returning({ id: schema.purchaseOrders.id });
    return res[0].id;
  });
}

export async function setPurchaseOrderStatus(mode: Mode, id: string, status: "RECEIVED" | "CANCELLED"): Promise<ActionResult<null>> {
  return run(async () => {
    await requireMode(mode, { admin: true });
    if (status !== "RECEIVED" && status !== "CANCELLED") fail("Unknown status.");
    const res = await db
      .update(schema.purchaseOrders)
      .set({ status })
      .where(and(eq(schema.purchaseOrders.id, id), eq(schema.purchaseOrders.mode, mode), eq(schema.purchaseOrders.status, "ORDERED")))
      .returning({ id: schema.purchaseOrders.id });
    if (!res.length) fail("Only open purchase orders in this dashboard can be updated.");
    return null;
  });
}

/* ==========================================================================
   Reconciliation of legacy (pre-split) records
   ========================================================================== */

/**
 * Assign unclassified legacy rows to a dashboard. Nothing is assigned
 * automatically — an admin picks the batches (and, optionally, all legacy
 * bills / customers / suppliers) and the target mode explicitly.
 */
export async function classifyLegacyRecords(
  target: Mode,
  payload: { batch_ids?: string[]; bills?: boolean; customers?: boolean; suppliers?: boolean },
): Promise<ActionResult<{ batches: number; bills: number; customers: number; suppliers: number }>> {
  return run(async () => {
    if (!isMode(target)) fail("Pick retail or wholesale.");
    await requireMode(target, { admin: true });
    const actor = await actorOf();
    const batchIds = (payload.batch_ids || []).filter((id) => typeof id === "string");

    return db.transaction(async (tx) => {
      let batchCount = 0;
      if (batchIds.length) {
        const moved = await tx
          .update(schema.batches)
          .set({ mode: target })
          .where(and(inArray(schema.batches.id, batchIds), isNull(schema.batches.mode)))
          .returning();
        batchCount = moved.length;
        for (const b of moved) {
          await logMovement(tx, {
            mode: target,
            batchId: b.id,
            medicineId: b.medicineId,
            type: "RECLASSIFY",
            qtyChange: 0,
            balanceAfter: b.stockQty,
            note: `Legacy stock assigned to ${target}`,
            actor,
          });
        }
      }
      const bills = payload.bills
        ? (await tx.update(schema.bills).set({ mode: target }).where(isNull(schema.bills.mode)).returning({ id: schema.bills.id })).length
        : 0;
      const customers = payload.customers
        ? (await tx.update(schema.customers).set({ mode: target }).where(isNull(schema.customers.mode)).returning({ id: schema.customers.id })).length
        : 0;
      const suppliers = payload.suppliers
        ? (await tx.update(schema.suppliers).set({ mode: target }).where(isNull(schema.suppliers.mode)).returning({ id: schema.suppliers.id })).length
        : 0;
      return { batches: batchCount, bills, customers, suppliers };
    });
  });
}
