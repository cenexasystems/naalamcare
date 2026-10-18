"use client";

/* ==========================================================================
   Nalam Care Medicals — local data store (browser localStorage)

   Only held bills are still read from here by the live app; everything else
   lives in Postgres. Kept for backup / restore of this device's data.
   ========================================================================== */

import {
  Batch,
  Bill,
  BillItem,
  CartLine,
  HeldBill,
  Customer,
  Medicine,
  MedicineWithBatches,
  PaymentMethod,
  ShopSettings,
  Store,
  Supplier,
} from "./types";
import { calcBillTotals, calcIncludedGst, round2 } from "./calc";

const STORAGE_KEY = "nalam_care_medicals_pms_v2";
/** Key used before the rename — read once so held bills on this device carry over. */
const LEGACY_STORAGE_KEY = "ak_pharma_pms_v2";

export const uid = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const nowIso = () => new Date().toISOString();

/** Fields added for the retail / wholesale split, blank on device-local records. */
const CUSTOMER_EXTRAS = {
  mode: null,
  business_type: "",
  gstin: "",
  shipping_address: "",
  credit_limit: 0,
  credit_days: 0,
  discount_percent: 0,
} as const;

/* -------------------------------------------------------------------------
   Defaults + seed data
   ------------------------------------------------------------------------- */

export const DEFAULT_SETTINGS: ShopSettings = {
  shop_name: "Nalam Care Medicals",
  full_name: "",
  address: "No. 18A/2B, Ground Floor, Old Township Road, Venkatapuram, Ambattur (OT), Chennai - 600053",
  phone: "7305723203",
  shop_contact_number: "8122884066",
  email: "sselvathurai00@gmail.com",
  /* Blank until the owner supplies the real numbers. Anything printed here
     shows verbatim on the A4 tax invoice. */
  gstin: "",
  dl_no: "",
  colour_theme: "nalam",
  logo: "/logos/nalam-care-medicals-logo.png",
  use_custom_logo: false,
  instagram_id: "",
  default_gst: 12,
  low_stock_threshold: 20,
  expiry_alert_months: 6,
};

type SeedRow = {
  generic: string;
  brand: string;
  maker: string;
  salt: string;
  schedule: Medicine["schedule"];
  hsn: string;
  gst: number;
  unitType: Batch["purchase_unit_type"];
  box: string;
  batchNo: string;
  mfg: string;
  exp: string;
  packSize: number;
  qtyPacks: number;
  stockLeft: number;
  rate: number;
  mrp: number;
  selling: number;
};

const SEED_ROWS: SeedRow[] = [
  { generic: "Paracetamol 500mg", brand: "Paracip", maker: "Zydus Healthcare", salt: "Paracetamol 500 mg", schedule: "OTC", hsn: "30049099", gst: 12, unitType: "Strip", box: "A1", batchNo: "P500A2306", mfg: "2025-05", exp: "2028-05", packSize: 10, qtyPacks: 50, stockLeft: 477, rate: 20, mrp: 60, selling: 40 },
  { generic: "Amoxicillin 500mg", brand: "Moxikind", maker: "Mankind Pharma", salt: "Amoxicillin 500 mg", schedule: "H", hsn: "30042021", gst: 12, unitType: "Strip", box: "A2", batchNo: "AMX2405", mfg: "2025-04", exp: "2028-04", packSize: 10, qtyPacks: 10, stockLeft: 85, rate: 35, mrp: 80, selling: 60 },
  { generic: "Cetirizine 10mg", brand: "Cetzine", maker: "GSK Pharma", salt: "Cetirizine HCl 10 mg", schedule: "OTC", hsn: "30049091", gst: 12, unitType: "Strip", box: "B1", batchNo: "CTZ0624", mfg: "2025-06", exp: "2027-06", packSize: 10, qtyPacks: 5, stockLeft: 32, rate: 18, mrp: 45, selling: 30 },
  { generic: "Azithromycin 500mg", brand: "Azicip", maker: "Cipla Ltd", salt: "Azithromycin 500 mg", schedule: "H1", hsn: "30042021", gst: 12, unitType: "Strip", box: "B2", batchNo: "AZ5002403", mfg: "2024-03", exp: "2026-11", packSize: 3, qtyPacks: 8, stockLeft: 18, rate: 50, mrp: 120, selling: 90 },
  { generic: "Ibuprofen 400mg", brand: "Brufen", maker: "Abbott India", salt: "Ibuprofen 400 mg", schedule: "OTC", hsn: "30049011", gst: 12, unitType: "Strip", box: "C1", batchNo: "IB40006124", mfg: "2024-06", exp: "2026-09", packSize: 10, qtyPacks: 5, stockLeft: 28, rate: 15, mrp: 35, selling: 25 },
  { generic: "Omeprazole 20mg", brand: "Omez", maker: "Dr Reddys Labs", salt: "Omeprazole 20 mg", schedule: "OTC", hsn: "30049019", gst: 12, unitType: "Strip", box: "C2", batchNo: "OME2405", mfg: "2025-05", exp: "2027-05", packSize: 10, qtyPacks: 6, stockLeft: 40, rate: 22, mrp: 50, selling: 35 },
  { generic: "Metformin 500mg", brand: "Glycomet", maker: "USV Private Ltd", salt: "Metformin HCl 500 mg", schedule: "H", hsn: "30044030", gst: 12, unitType: "Strip", box: "D1", batchNo: "MF5002401", mfg: "2024-01", exp: "2026-10", packSize: 10, qtyPacks: 4, stockLeft: 10, rate: 12, mrp: 30, selling: 20 },
  { generic: "Vitamin D3 60K", brand: "Shelcal D3", maker: "Torrent Pharma", salt: "Cholecalciferol 60000 IU", schedule: "OTC", hsn: "21069099", gst: 18, unitType: "Strip", box: "D2", batchNo: "VITD602403", mfg: "2024-02", exp: "2026-06", packSize: 4, qtyPacks: 6, stockLeft: 5, rate: 25, mrp: 70, selling: 50 },
  { generic: "ORS Powder 21g", brand: "Electral", maker: "FDC Limited", salt: "Oral Rehydration Salts", schedule: "OTC", hsn: "30049099", gst: 12, unitType: "Piece", box: "E1", batchNo: "ORS2501", mfg: "2025-01", exp: "2027-01", packSize: 1, qtyPacks: 60, stockLeft: 58, rate: 12, mrp: 25, selling: 20 },
  { generic: "Cough Syrup 100ml", brand: "Benadryl", maker: "Johnson & Johnson", salt: "Diphenhydramine + Ammonium Cl", schedule: "NRX", hsn: "30049087", gst: 12, unitType: "Bottle", box: "E2", batchNo: "BEN2503", mfg: "2025-03", exp: "2027-03", packSize: 1, qtyPacks: 24, stockLeft: 24, rate: 60, mrp: 130, selling: 110 },
  { generic: "Amlodipine 5mg", brand: "Amlokind", maker: "Mankind Pharma", salt: "Amlodipine Besylate 5 mg", schedule: "H", hsn: "30049069", gst: 12, unitType: "Strip", box: "F1", batchNo: "AML5002502", mfg: "2025-02", exp: "2028-02", packSize: 10, qtyPacks: 10, stockLeft: 96, rate: 14, mrp: 40, selling: 28 },
  { generic: "Pantoprazole 40mg", brand: "Pantocid", maker: "Sun Pharma", salt: "Pantoprazole 40 mg", schedule: "H", hsn: "30049019", gst: 12, unitType: "Strip", box: "F2", batchNo: "PAN4002504", mfg: "2025-04", exp: "2027-10", packSize: 10, qtyPacks: 8, stockLeft: 74, rate: 30, mrp: 75, selling: 55 },
];

const SEED_SUPPLIERS: { name: string; phone: string; gstin: string }[] = [
  { name: "Medicare Distributors", phone: "9842011223", gstin: "33AACCM1234K1Z2" },
  { name: "Sri Balaji Pharma Agencies", phone: "9843122334", gstin: "33AAFCS4567L1Z9" },
  { name: "Anaimalai Medical Supplies", phone: "9944556677", gstin: "33AAGCA7788M1Z4" },
];

const buildSeed = (): Store => {
  const created = nowIso();
  const medicines: Medicine[] = [];
  const batches: Batch[] = [];

  const suppliers: Supplier[] = SEED_SUPPLIERS.map((s) => ({
    id: uid(),
    name: s.name,
    phone: s.phone,
    gstin: s.gstin,
    address: "",
    mode: null,
    created_at: created,
  }));

  SEED_ROWS.forEach((row) => {
    const medicineId = uid();
    medicines.push({
      id: medicineId,
      generic_name: row.generic,
      brand_name: row.brand,
      manufacturer: row.maker,
      salt: row.salt,
      schedule: row.schedule,
      hsn_code: row.hsn,
      gst_percent: row.gst,
      purchase_unit_type: row.unitType,
      low_stock_threshold: 20,
      barcode: "",
      wholesale_moq: 0,
      archived: false,
      created_at: created,
    });

    batches.push({
      id: uid(),
      medicine_id: medicineId,
      supplier_id: suppliers[0].id,
      brand_name: row.brand,
      manufacturer: row.maker,
      invoice_no: "INV-2456",
      purchase_date: created.slice(0, 10),
      batch_no: row.batchNo,
      mfg_date: row.mfg,
      exp_date: row.exp,
      box: row.box,
      purchase_unit_type: row.unitType,
      pack_size: row.packSize,
      qty_packs: row.qtyPacks,
      stock_added: row.packSize * row.qtyPacks,
      stock_qty: row.stockLeft,
      purchase_rate: row.rate,
      mrp: row.mrp,
      selling_price: row.selling,
      gst_percent: row.gst,
      mode: null,
      source_batch_id: null,
      created_at: created,
    });
  });

  const customers: Customer[] = [
    { id: "NCM000001", name: "Karthik", phone: "7350179069", address: "Anaimalai, Coimbatore", doctor_name: "Dr. R. Mohan", email: "", age: "", gender: "", quick_bill: true, ...CUSTOMER_EXTRAS, created_at: created },
    { id: "NCM000002", name: "Priya S", phone: "9865321470", address: "Pollachi Main Road", doctor_name: "Dr. S. Latha", email: "", age: "", gender: "", quick_bill: true, ...CUSTOMER_EXTRAS, created_at: created },
    { id: "NCM000003", name: "Ramesh Kumar", phone: "9791234560", address: "Thirumurthy Nagar", doctor_name: "", email: "", age: "", gender: "", quick_bill: false, ...CUSTOMER_EXTRAS, created_at: created },
  ];

  return {
    medicines,
    suppliers,
    batches,
    customers,
    bills: [],
    held: [],
    settings: { ...DEFAULT_SETTINGS },
    counters: { bill: 124, customer: 3 },
  };
};

/* -------------------------------------------------------------------------
   Read / write
   ------------------------------------------------------------------------- */

let cache: Store | null = null;
let version = 0;
const listeners = new Set<() => void>();

/** Bumped on every write — the snapshot key for `useSyncExternalStore`. */
export const getVersion = (): number => version;

/** Server snapshot: no browser storage, so there is nothing to read yet. */
export const getServerVersion = (): number => -1;

const emptyStore = (): Store => ({
  medicines: [],
  suppliers: [],
  batches: [],
  customers: [],
  bills: [],
  held: [],
  settings: { ...DEFAULT_SETTINGS },
  counters: { bill: 124, customer: 0 },
});

export const readStore = (): Store => {
  if (typeof window === "undefined") return emptyStore();
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      const seeded = buildSeed();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      cache = seeded;
      return seeded;
    }

    const parsed = JSON.parse(raw) as Partial<Store>;
    cache = {
      medicines: parsed.medicines || [],
      suppliers: parsed.suppliers || [],
      batches: parsed.batches || [],
      customers: parsed.customers || [],
      bills: parsed.bills || [],
      held: parsed.held || [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      counters: {
        bill: parsed.counters?.bill ?? 124,
        customer: parsed.counters?.customer ?? 0,
      },
    };
    return cache;
  } catch (err) {
    console.warn("Store read failed:", err);
    return emptyStore();
  }
};

const writeStore = (store: Store): void => {
  cache = store;
  version += 1;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.warn("Store write failed:", err);
  }
  listeners.forEach((fn) => fn());
};

export const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const mutate = (fn: (store: Store) => void): void => {
  const store = readStore();
  fn(store);
  writeStore(store);
};

/* -------------------------------------------------------------------------
   ID generators
   ------------------------------------------------------------------------- */

/** Customer ID — NCM000001 */
export const nextCustomerId = (store: Store): string =>
  `NCM${String(store.counters.customer + 1).padStart(6, "0")}`;

/** Bill number — auto generated, client format: B000125 */
export const peekBillNo = (): string => {
  const store = readStore();
  return `B${String(store.counters.bill + 1).padStart(6, "0")}`;
};

/* -------------------------------------------------------------------------
   Selectors
   ------------------------------------------------------------------------- */

export const listMedicines = (): MedicineWithBatches[] => {
  const store = readStore();
  return store.medicines
    .map((m) => joinBatches(m, store.batches))
    .sort((a, b) => a.generic_name.localeCompare(b.generic_name));
};

export const joinBatches = (medicine: Medicine, allBatches: Batch[]): MedicineWithBatches => {
  const own = allBatches
    .filter((b) => b.medicine_id === medicine.id)
    .sort((a, b) => a.exp_date.localeCompare(b.exp_date));

  const inStock = own.filter((b) => b.stock_qty > 0);
  const total = own.reduce((sum, b) => sum + b.stock_qty, 0);

  return {
    ...medicine,
    batches: own,
    total_stock: total,
    active_batch: inStock[0] || own[0] || null,
    earliest_expiry: inStock[0]?.exp_date || null,
  };
};

export const listBatchRows = () => {
  const store = readStore();
  return store.batches
    .map((batch) => {
      const medicine = store.medicines.find((m) => m.id === batch.medicine_id);
      const supplier = store.suppliers.find((s) => s.id === batch.supplier_id);
      return { batch, medicine, supplier_name: supplier?.name || "" };
    })
    .filter((row): row is { batch: Batch; medicine: Medicine; supplier_name: string } =>
      Boolean(row.medicine),
    )
    .sort((a, b) => a.medicine.generic_name.localeCompare(b.medicine.generic_name));
};

export const listSuppliers = (): Supplier[] => [...readStore().suppliers];

export const listHeldBills = (): HeldBill[] => [...readStore().held];

/* -------------------------------------------------------------------------
   Version-keyed snapshots for `useSyncExternalStore`
   -------------------------------------------------------------------------
   Each getter returns the same reference until the store is written to, so
   components can subscribe directly without memoising. */

export type BatchRow = { batch: Batch; medicine: Medicine; supplier_name: string };

type Snapshot = {
  version: number;
  medicines: MedicineWithBatches[];
  batchRows: BatchRow[];
  bills: Bill[];
  customers: Customer[];
  suppliers: Supplier[];
  held: HeldBill[];
};

let snapshot: Snapshot | null = null;

const currentSnapshot = (): Snapshot => {
  if (!snapshot || snapshot.version !== version) {
    snapshot = {
      version,
      medicines: listMedicines(),
      batchRows: listBatchRows(),
      bills: listBills(),
      customers: listCustomers(),
      suppliers: listSuppliers(),
      held: listHeldBills(),
    };
  }
  return snapshot;
};

const EMPTY: never[] = [];
const empty = <T,>(): T[] => EMPTY as unknown as T[];

export const medicinesSnapshot = (): MedicineWithBatches[] => currentSnapshot().medicines;
export const batchRowsSnapshot = (): BatchRow[] => currentSnapshot().batchRows;
export const billsSnapshot = (): Bill[] => currentSnapshot().bills;
export const customersSnapshot = (): Customer[] => currentSnapshot().customers;
export const suppliersSnapshot = (): Supplier[] => currentSnapshot().suppliers;
export const heldSnapshot = (): HeldBill[] => currentSnapshot().held;

/** Server snapshots — no browser storage yet, and referentially stable. */
export const emptyMedicines = (): MedicineWithBatches[] => empty<MedicineWithBatches>();
export const emptyBatchRows = (): BatchRow[] => empty<BatchRow>();
export const emptyBills = (): Bill[] => empty<Bill>();
export const emptyCustomers = (): Customer[] => empty<Customer>();
export const emptySuppliers = (): Supplier[] => empty<Supplier>();
export const emptyHeld = (): HeldBill[] => empty<HeldBill>();

export const listCustomers = (): Customer[] =>
  [...readStore().customers].sort((a, b) => b.created_at.localeCompare(a.created_at));

export const findCustomerByPhone = (phone: string): Customer | null =>
  readStore().customers.find((c) => c.phone === phone.trim()) || null;

export const listBills = (): Bill[] =>
  [...readStore().bills].sort((a, b) => b.created_at.localeCompare(a.created_at));

export const getBill = (id: string): Bill | null =>
  readStore().bills.find((b) => b.id === id) || null;

export const getSettings = (): ShopSettings => readStore().settings;

export const saveHeldBills = (held: HeldBill[]): void =>
  mutate((store) => {
    store.held = held;
  });

export const customerHistory = (customerId: string): Bill[] =>
  listBills().filter((b) => b.customer_id === customerId);

/* -------------------------------------------------------------------------
   Mutations — medicines
   ------------------------------------------------------------------------- */

export const saveMedicine = (
  input: Omit<Medicine, "id" | "created_at"> & { id?: string },
): Medicine => {
  let saved!: Medicine;
  mutate((store) => {
    if (input.id) {
      const idx = store.medicines.findIndex((m) => m.id === input.id);
      if (idx >= 0) {
        store.medicines[idx] = { ...store.medicines[idx], ...input, id: input.id };
        saved = store.medicines[idx];
        return;
      }
    }
    saved = { ...input, id: input.id || uid(), created_at: nowIso() } as Medicine;
    store.medicines.push(saved);
  });
  return saved;
};

export const deleteMedicine = (id: string): void =>
  mutate((store) => {
    store.medicines = store.medicines.filter((m) => m.id !== id);
    store.batches = store.batches.filter((b) => b.medicine_id !== id);
  });

/* -------------------------------------------------------------------------
   Mutations — suppliers
   ------------------------------------------------------------------------- */

export const saveSupplier = (input: Omit<Supplier, "id" | "created_at"> & { id?: string }): Supplier => {
  let saved!: Supplier;
  mutate((store) => {
    if (input.id) {
      const idx = store.suppliers.findIndex((s) => s.id === input.id);
      if (idx >= 0) {
        store.suppliers[idx] = { ...store.suppliers[idx], ...input, id: input.id };
        saved = store.suppliers[idx];
        return;
      }
    }
    saved = { ...input, id: input.id || uid(), created_at: nowIso() } as Supplier;
    store.suppliers.push(saved);
  });
  return saved;
};

export const deleteSupplier = (id: string): void =>
  mutate((store) => {
    store.suppliers = store.suppliers.filter((s) => s.id !== id);
  });

/* -------------------------------------------------------------------------
   Mutations — purchase / batches
   ------------------------------------------------------------------------- */

export const saveBatch = (input: Omit<Batch, "id" | "created_at"> & { id?: string }): Batch => {
  let saved!: Batch;
  mutate((store) => {
    if (input.id) {
      const idx = store.batches.findIndex((b) => b.id === input.id);
      if (idx >= 0) {
        store.batches[idx] = { ...store.batches[idx], ...input, id: input.id };
        saved = store.batches[idx];
        return;
      }
    }
    saved = { ...input, id: input.id || uid(), created_at: nowIso() } as Batch;
    store.batches.push(saved);
  });
  return saved;
};

export const deleteBatch = (id: string): void =>
  mutate((store) => {
    store.batches = store.batches.filter((b) => b.id !== id);
  });

export const adjustBatchStock = (id: string, newQty: number): void =>
  mutate((store) => {
    const batch = store.batches.find((b) => b.id === id);
    if (batch) batch.stock_qty = Math.max(0, newQty);
  });

/* -------------------------------------------------------------------------
   Mutations — customers
   ------------------------------------------------------------------------- */

export const saveCustomer = (input: {
  id?: string;
  name: string;
  phone: string;
  address?: string;
  doctor_name?: string;
  quick_bill?: boolean;
}): Customer => {
  let saved!: Customer;
  mutate((store) => {
    const existing =
      (input.id && store.customers.find((c) => c.id === input.id)) ||
      (input.phone.trim() && store.customers.find((c) => c.phone === input.phone.trim()));

    if (existing) {
      existing.name = input.name || existing.name;
      existing.phone = input.phone || existing.phone;
      existing.address = input.address ?? existing.address;
      existing.doctor_name = input.doctor_name ?? existing.doctor_name;
      if (typeof input.quick_bill === "boolean") existing.quick_bill = input.quick_bill;
      saved = existing;
      return;
    }

    saved = {
      id: nextCustomerId(store),
      name: input.name,
      phone: input.phone,
      address: input.address || "",
      doctor_name: input.doctor_name || "",
      email: "",
      age: "",
      gender: "",
      quick_bill: Boolean(input.quick_bill),
      ...CUSTOMER_EXTRAS,
      created_at: nowIso(),
    };
    store.customers.push(saved);
    store.counters.customer += 1;
  });
  return saved;
};

export const deleteCustomer = (id: string): void =>
  mutate((store) => {
    store.customers = store.customers.filter((c) => c.id !== id);
  });

/* -------------------------------------------------------------------------
   Mutations — settings
   ------------------------------------------------------------------------- */

export const saveSettings = (patch: Partial<ShopSettings>): void =>
  mutate((store) => {
    store.settings = { ...store.settings, ...patch };
  });

/* -------------------------------------------------------------------------
   Billing
   ------------------------------------------------------------------------- */

export const submitBill = (payload: {
  lines: CartLine[];
  customer: { id: string | null; name: string; phone: string; address: string; doctor: string; quickBill: boolean };
  billDate: string;
  receivedAmount: number;
  paymentMethod: PaymentMethod;
}): Bill => {
  let saved!: Bill;

  mutate((store) => {
    const billId = `B${String(store.counters.bill + 1).padStart(6, "0")}`;
    store.counters.bill += 1;

    // Register / update the customer when details were supplied
    let customerId: string | null = payload.customer.id;
    if (payload.customer.phone.trim() || payload.customer.name.trim()) {
      const existing =
        store.customers.find((c) => c.id === payload.customer.id) ||
        store.customers.find((c) => c.phone === payload.customer.phone.trim());

      if (existing) {
        if (payload.customer.name.trim()) existing.name = payload.customer.name.trim();
        if (payload.customer.address.trim()) existing.address = payload.customer.address.trim();
        if (payload.customer.doctor.trim()) existing.doctor_name = payload.customer.doctor.trim();
        if (payload.customer.quickBill) existing.quick_bill = true;
        customerId = existing.id;
      } else {
        const created: Customer = {
          id: nextCustomerId(store),
          name: payload.customer.name.trim() || "Walk-in Customer",
          phone: payload.customer.phone.trim(),
          address: payload.customer.address.trim(),
          doctor_name: payload.customer.doctor.trim(),
          email: "",
          age: "",
          gender: "",
          quick_bill: payload.customer.quickBill,
          ...CUSTOMER_EXTRAS,
          created_at: nowIso(),
        };
        store.customers.push(created);
        store.counters.customer += 1;
        customerId = created.id;
      }
    }

    const totals = calcBillTotals(payload.lines);

    const items: BillItem[] = payload.lines.map((line) => ({
      id: uid(),
      bill_id: billId,
      medicine_id: line.medicine_id,
      batch_id: line.batch_id,
      generic_name: line.generic_name,
      brand_name: line.brand_name,
      manufacturer: line.manufacturer,
      schedule: line.schedule,
      hsn_code: line.hsn_code,
      batch_no: line.batch_no,
      mfg_date: line.mfg_date,
      exp_date: line.exp_date,
      box: line.box,
      purchase_unit_type: line.purchase_unit_type,
      pack_size: line.pack_size,
      qty: line.qty,
      mrp_per_unit: line.mrp_per_unit,
      per_unit_price: line.per_unit_price,
      line_mrp: round2(line.mrp_per_unit * line.qty),
      line_amount: round2(line.per_unit_price * line.qty),
      line_discount: round2((line.mrp_per_unit - line.per_unit_price) * line.qty),
      gst_percent: line.gst_percent,
      cost_per_unit: 0,
      returned_qty: 0,
    }));

    // Deduct stock from the exact batch that was billed
    for (const line of payload.lines) {
      const batch = store.batches.find((b) => b.id === line.batch_id);
      if (batch) batch.stock_qty = Math.max(0, batch.stock_qty - line.qty);
    }

    saved = {
      id: billId,
      customer_id: customerId,
      customer_name: payload.customer.name.trim(),
      customer_phone: payload.customer.phone.trim(),
      customer_address: payload.customer.address.trim(),
      doctor_name: payload.customer.doctor.trim(),
      customer_email: "",
      customer_age: "",
      customer_gender: "",
      prescription_no: "",
      billed_by: "",
      txn_ref: "",
      bill_date: payload.billDate,
      created_at: nowIso(),
      sub_total: totals.subTotal,
      discount: totals.discount,
      taxable_amount: totals.taxableAmount,
      gst_amount: totals.gstAmount,
      gst_percent: totals.gstPercent,
      grand_total: totals.grandTotal,
      received_amount: payload.receivedAmount,
      change_amount: round2(Math.max(0, payload.receivedAmount - totals.grandTotal)),
      payment_method: payload.paymentMethod,
      status: "COMPLETED",
      mode: null,
      paid_amount: totals.grandTotal,
      due_amount: 0,
      due_date: null,
      returned_amount: 0,
      shipping_address: "",
      customer_gstin: "",
      items,
    };

    store.bills.push(saved);
  });

  return saved;
};

export const deleteBill = (id: string): void =>
  mutate((store) => {
    const bill = store.bills.find((b) => b.id === id);
    if (bill) {
      // return the stock
      for (const item of bill.items) {
        const batch = store.batches.find((b) => b.id === item.batch_id);
        if (batch) batch.stock_qty += item.qty;
      }
    }
    store.bills = store.bills.filter((b) => b.id !== id);
  });

/* -------------------------------------------------------------------------
   Backup / restore
   ------------------------------------------------------------------------- */

export const exportBackup = (): string => JSON.stringify(readStore(), null, 2);

export const importBackup = (json: string): boolean => {
  try {
    const parsed = JSON.parse(json) as Store;
    if (!parsed || !Array.isArray(parsed.medicines)) return false;
    writeStore({
      medicines: parsed.medicines || [],
      suppliers: parsed.suppliers || [],
      batches: parsed.batches || [],
      customers: parsed.customers || [],
      bills: parsed.bills || [],
      held: parsed.held || [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      counters: {
        bill: parsed.counters?.bill ?? 124,
        customer: parsed.counters?.customer ?? 0,
      },
    });
    return true;
  } catch {
    return false;
  }
};

export const resetStore = (): void => {
  cache = null;
  if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
  writeStore(buildSeed());
};

export const gstInside = calcIncludedGst;
