import "server-only";
import { db } from "./client";
import * as schema from "./schema";
import { and, eq, desc, asc, inArray, isNull } from "drizzle-orm";
import type {
  MedicineWithBatches,
  Batch,
  Customer,
  Supplier,
  Bill,
  ShopSettings,
  BatchRow,
  ModeSettings,
  ScopedSettings,
  LedgerData,
  ReconciliationSummary,
  StockMovement,
  SalesReturn,
} from "../types";
import type { Mode } from "../mode";
import {
  mapMedicine,
  mapBatch,
  mapCustomer,
  mapSupplier,
  mapBill,
  mapSettings,
  mapModeSettings,
  mapPayment,
  mapSalesReturn,
  mapPurchaseReturn,
  mapPurchaseOrder,
  mapStockMovement,
} from "./map";

/* ==========================================================================
   Read queries

   The medicine catalogue is shared, so every dashboard sees every medicine —
   but only its own batches, bills, customers and suppliers. Each function that
   touches business data takes the mode explicitly; callers have already
   checked the session is allowed into it (see lib/auth.ts).
   ========================================================================== */

export async function getModeSettings(mode: Mode): Promise<ModeSettings> {
  const rows = await db.select().from(schema.modeSettings).where(eq(schema.modeSettings.mode, mode)).limit(1);
  return mapModeSettings(rows[0], mode);
}

/** Catalogue (non-archived medicines) joined with this mode's batches only. */
export async function listMedicines(mode: Mode): Promise<MedicineWithBatches[]> {
  const [allMeds, allBatches, modeSettings] = await Promise.all([
    db.select().from(schema.medicines).where(eq(schema.medicines.archived, false)).orderBy(schema.medicines.genericName),
    db.select().from(schema.batches).where(eq(schema.batches.mode, mode)).orderBy(asc(schema.batches.expDate)),
    getModeSettings(mode),
  ]);

  const batchesByMedId = allBatches.reduce((acc, row) => {
    const batch = mapBatch(row);
    if (!acc[batch.medicine_id]) acc[batch.medicine_id] = [];
    acc[batch.medicine_id].push(batch);
    return acc;
  }, {} as Record<string, Batch[]>);

  return allMeds.map((medRow) => {
    const med = mapMedicine(medRow);
    // A mode-wide threshold (e.g. bigger wholesale quantities) overrides the per-medicine one.
    if (modeSettings.low_stock_threshold > 0) med.low_stock_threshold = modeSettings.low_stock_threshold;
    const mBatches = batchesByMedId[med.id] || [];
    let activeBatch: Batch | null = null;
    let totalStock = 0;
    let earliestExpiry: string | null = null;

    for (const b of mBatches) {
      if (b.stock_qty > 0) {
        totalStock += b.stock_qty;
        if (!activeBatch) activeBatch = b;
      }
      if (!earliestExpiry && b.exp_date) {
        earliestExpiry = b.exp_date;
      }
    }

    return {
      ...med,
      batches: mBatches,
      total_stock: totalStock,
      active_batch: activeBatch,
      earliest_expiry: earliestExpiry,
    };
  });
}

const toBatchRows = async (
  rows: { batch: typeof schema.batches.$inferSelect; med: typeof schema.medicines.$inferSelect }[],
  lowStockOverride = 0,
): Promise<BatchRow[]> => {
  const supplierRows = await db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers);
  const supplierName = new Map(supplierRows.map((s) => [s.id, s.name]));
  return rows.map(({ batch, med }) => {
    const m = mapMedicine(med);
    if (lowStockOverride > 0) m.low_stock_threshold = lowStockOverride;
    const b = mapBatch(batch);
    return { batch: b, medicine: m, supplier_name: (b.supplier_id && supplierName.get(b.supplier_id)) || "—" };
  });
};

export async function listBatchRows(mode: Mode): Promise<BatchRow[]> {
  const [rows, modeSettings] = await Promise.all([
    db
      .select({ batch: schema.batches, med: schema.medicines })
      .from(schema.batches)
      .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
      .where(eq(schema.batches.mode, mode))
      .orderBy(desc(schema.batches.createdAt)),
    getModeSettings(mode),
  ]);
  return toBatchRows(rows, modeSettings.low_stock_threshold);
}

/** The supplier directory is shared by both modes; balances are worked out per mode from that mode's records. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function listSuppliers(_mode: Mode): Promise<Supplier[]> {
  const rows = await db.select().from(schema.suppliers).orderBy(schema.suppliers.name);
  return rows.map(mapSupplier);
}

export async function listCustomers(mode: Mode): Promise<Customer[]> {
  const rows = await db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.mode, mode))
    .orderBy(desc(schema.customers.createdAt));
  return rows.map(mapCustomer);
}

const withItems = async (billRows: (typeof schema.bills.$inferSelect)[]): Promise<Bill[]> => {
  const billIds = billRows.map((b) => b.id);
  if (!billIds.length) return [];
  const items = await db.select().from(schema.billItems).where(inArray(schema.billItems.billId, billIds)).orderBy(schema.billItems.id);
  const itemsByBillId = items.reduce((acc, row) => {
    if (!acc[row.billId]) acc[row.billId] = [];
    acc[row.billId].push(row);
    return acc;
  }, {} as Record<string, (typeof schema.billItems.$inferSelect)[]>);
  return billRows.map((row) => mapBill(row, itemsByBillId[row.id] || []));
};

export async function listBills(mode: Mode): Promise<Bill[]> {
  const billRows = await db.select().from(schema.bills).where(eq(schema.bills.mode, mode)).orderBy(desc(schema.bills.createdAt));
  return withItems(billRows);
}

/** A bill regardless of mode — callers must check `bill.mode` against the session. */
export async function getBill(id: string): Promise<Bill | null> {
  const rows = await db.select().from(schema.bills).where(eq(schema.bills.id, id)).limit(1);
  if (!rows.length) return null;
  const items = await db.select().from(schema.billItems).where(eq(schema.billItems.billId, id));
  return mapBill(rows[0], items);
}

/** Returns recorded against one bill, oldest first (printed on its invoice). */
export async function getBillReturns(billId: string): Promise<SalesReturn[]> {
  const rows = await db
    .select()
    .from(schema.salesReturns)
    .where(eq(schema.salesReturns.billId, billId))
    .orderBy(asc(schema.salesReturns.createdAt));
  return rows.map(mapSalesReturn);
}

export async function getSettings(): Promise<ShopSettings | null> {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.id, 1)).limit(1);
  if (!rows.length) return null;
  return mapSettings(rows[0]);
}

/** This mode's shop identity, GSTIN / licence and stock & tax defaults, over the shop-wide
    values (logo, colour theme and Instagram stay shared). A blank mode field uses the shop-wide one. */
export const applyModeShopDetails = (shop: ShopSettings, ms: ModeSettings): ShopSettings => ({
  ...shop,
  shop_name: ms.shop_name || shop.shop_name,
  full_name: ms.full_name || shop.full_name,
  address: ms.address || shop.address,
  phone: ms.phone || shop.phone,
  shop_contact_number: ms.shop_contact_number || shop.shop_contact_number,
  email: ms.email || shop.email,
  gstin: ms.gstin || shop.gstin,
  dl_no: ms.dl_no || shop.dl_no,
  default_gst: ms.default_gst,
  low_stock_threshold: ms.low_stock_threshold || shop.low_stock_threshold,
  expiry_alert_months: ms.expiry_alert_months || shop.expiry_alert_months,
});

/** Shop details as seen from one billing mode, plus that mode's settings. */
export async function getScopedSettings(mode: Mode): Promise<ScopedSettings | null> {
  const [shop, modeSettings] = await Promise.all([getSettings(), getModeSettings(mode)]);
  if (!shop) return null;
  return { ...applyModeShopDetails(shop, modeSettings), mode_settings: modeSettings };
}

export async function getLedger(mode: Mode): Promise<LedgerData> {
  const [payments, salesReturns, purchaseReturns, purchaseOrders] = await Promise.all([
    db.select().from(schema.payments).where(eq(schema.payments.mode, mode)).orderBy(desc(schema.payments.createdAt)),
    db.select().from(schema.salesReturns).where(eq(schema.salesReturns.mode, mode)).orderBy(desc(schema.salesReturns.createdAt)),
    db.select().from(schema.purchaseReturns).where(eq(schema.purchaseReturns.mode, mode)).orderBy(desc(schema.purchaseReturns.createdAt)),
    db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.mode, mode)).orderBy(desc(schema.purchaseOrders.createdAt)),
  ]);
  return {
    payments: payments.map(mapPayment),
    salesReturns: salesReturns.map(mapSalesReturn),
    purchaseReturns: purchaseReturns.map(mapPurchaseReturn),
    purchaseOrders: purchaseOrders.map(mapPurchaseOrder),
  };
}

export async function listStockMovements(mode: Mode, batchId: string): Promise<StockMovement[]> {
  const rows = await db
    .select()
    .from(schema.stockMovements)
    .where(and(eq(schema.stockMovements.mode, mode), eq(schema.stockMovements.batchId, batchId)))
    .orderBy(desc(schema.stockMovements.createdAt));
  return rows.map(mapStockMovement);
}

/** Legacy rows from before the retail / wholesale split (mode IS NULL). */
export async function getReconciliation(): Promise<ReconciliationSummary> {
  const [batchRows, bills, customers] = await Promise.all([
    db
      .select({ batch: schema.batches, med: schema.medicines })
      .from(schema.batches)
      .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
      .where(isNull(schema.batches.mode))
      .orderBy(asc(schema.medicines.genericName)),
    db.select({ id: schema.bills.id }).from(schema.bills).where(isNull(schema.bills.mode)),
    db.select({ id: schema.customers.id }).from(schema.customers).where(isNull(schema.customers.mode)),
  ]);
  return {
    batches: await toBatchRows(batchRows),
    bills: bills.length,
    customers: customers.length,
    // Suppliers are a shared directory — nothing to classify.
    suppliers: 0,
  };
}
