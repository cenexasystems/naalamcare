/* ==========================================================================
   Nalam Care Medicals — Pharmacy Management System
   Data model
   ========================================================================== */

import type { Mode } from "./mode";
import type { InvoicePromo } from "./promo";
import type { TypeDiscountRule } from "./type-discounts";
export type { Mode } from "./mode";

/** Server actions return this instead of throwing, so messages survive production builds. */
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

/** Regulatory drug schedule (client spec: H, H1, X, NRX, OTC, General) */
export type DrugSchedule = "H" | "H1" | "X" | "NRX" | "OTC" | "General";

/** How the medicine is purchased from the supplier */
/** "Strip", "Piece", "Bottle" or any unit added in Settings → Purchase Units */
export type PurchaseUnitType = string;

/** Cash / UPI / Card at the counter; wholesale adds Bank Transfer, Cheque and Credit. */
export type PaymentMethod = "Cash" | "UPI" | "Card" | "Bank Transfer" | "Cheque" | "Credit";

/** Medicine master record */
export type Medicine = {
  id: string;
  /** Paracetamol 500mg */
  generic_name: string;
  /** Paracip */
  brand_name: string;
  /** Zydus Healthcare */
  manufacturer: string;
  /** Salt composition shown on the billing card */
  salt: string;
  schedule: DrugSchedule;
  /** Tablet / Injection / General / … (Settings → Product Types); "" = not set */
  product_type: string;
  hsn_code: string;
  gst_percent: number;
  purchase_unit_type: PurchaseUnitType;
  low_stock_threshold: number;
  /** EAN / UPC for barcode scanning (optional) */
  barcode: string;
  /** Minimum wholesale order in packs (0 = none) */
  wholesale_moq: number;
  /** Archived products stay on old bills but are hidden from search */
  archived: boolean;
  created_at: string;
};

/** Supplier master */
export type Supplier = {
  id: string;
  name: string;
  phone: string;
  gstin: string;
  address: string;
  mode: Mode | null;
  created_at: string;
};

/**
 * A purchased batch of a medicine.
 *
 * Money fields are PER PACK (per strip / piece / bottle).
 * `pack_size` is the numeric "Purchase Unit" — how many sellable units are in
 * one pack (e.g. 10 tablets per strip).
 *
 * `brand_name` and `manufacturer` live here because the same generic medicine
 * (e.g. Azithromycin 500mg) can be stocked from multiple brands/makers.
 */
export type Batch = {
  id: string;
  medicine_id: string;
  supplier_id: string | null;
  /** Brand name specific to this purchase batch (e.g. "Azicip") */
  brand_name: string;
  /** Manufacturer specific to this purchase batch (e.g. "Cipla Ltd") */
  manufacturer: string;
  invoice_no: string;
  /** yyyy-mm-dd */
  purchase_date: string;
  batch_no: string;
  /** yyyy-mm */
  mfg_date: string;
  /** yyyy-mm */
  exp_date: string;
  /** Box mapping — physical rack location, e.g. "A1" */
  box: string;
  purchase_unit_type: PurchaseUnitType;
  /** Numeric "Purchase Unit" — units per pack */
  pack_size: number;
  /** Packs (strips) in one box; 0 = not sold by the box */
  strips_per_box: number;
  /** Number of packs purchased */
  qty_packs: number;
  /** pack_size x qty_packs */
  stock_added: number;
  /** Remaining sellable units */
  stock_qty: number;
  /** Purchase rate per pack */
  purchase_rate: number;
  /** MRP per pack (GST inclusive) */
  mrp: number;
  /** Selling price per pack (GST inclusive) */
  selling_price: number;
  gst_percent: number;
  /** Which inventory this batch belongs to; null = legacy stock awaiting reconciliation */
  mode: Mode | null;
  /** Batch this one was transferred from (other mode), for traceability; null for purchased stock */
  source_batch_id: string | null;
  created_at: string;
};

/** Medicine joined with its live batches */
export type MedicineWithBatches = Medicine & {
  batches: Batch[];
  total_stock: number;
  /** First-expiring batch that still has stock */
  active_batch: Batch | null;
  earliest_expiry: string | null;
};

export type Customer = {
  /** NCM000001 (retail) / NCW000001 (wholesale) */
  id: string;
  name: string;
  phone: string;
  address: string;
  doctor_name: string;
  email: string;
  age: string;
  /** "M" / "F" / "O" or blank */
  gender: string;
  /** Registered for Quick Bill */
  quick_bill: boolean;
  mode: Mode | null;
  /** Wholesale buyer type — Retailer, Medical Shop, Clinic, Hospital, Distributor, Other */
  business_type: string;
  gstin: string;
  shipping_address: string;
  /** 0 = no limit */
  credit_limit: number;
  /** Payment terms in days (0 = mode default) */
  credit_days: number;
  /** Customer-specific discount % off the selling price */
  discount_percent: number;
  /** Wholesale: contact person and drug licence number of the pharmacy / distributor */
  contact_person: string;
  dl_no: string;
  created_at: string;
};

/** A line on a bill. Quantities and prices here are PER SELLABLE UNIT. */
export type BillItem = {
  id: string;
  bill_id: string;
  medicine_id: string;
  batch_id: string;
  generic_name: string;
  brand_name: string;
  manufacturer: string;
  schedule: DrugSchedule;
  /** Tablet / Injection / General / … (Settings → Product Types); "" = not set */
  product_type: string;
  hsn_code: string;
  batch_no: string;
  mfg_date: string;
  exp_date: string;
  /** Box mapping shown on the bill grid */
  box: string;
  purchase_unit_type: PurchaseUnitType;
  pack_size: number;
  /** Sold quantity in units */
  qty: number;
  mrp_per_unit: number;
  per_unit_price: number;
  /** mrp_per_unit x qty */
  line_mrp: number;
  /** per_unit_price x qty */
  line_amount: number;
  /** line_mrp - line_amount */
  line_discount: number;
  gst_percent: number;
  /** Purchase cost per unit when sold (0 on bills made before this was tracked) */
  cost_per_unit: number;
  /** Units already returned against this line */
  returned_qty: number;
};

export type Bill = {
  /** Auto-generated, format B000125 */
  id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  doctor_name: string;
  customer_email: string;
  customer_age: string;
  customer_gender: string;
  /** Prescription number typed in at checkout */
  prescription_no: string;
  /** Staff member who made the bill */
  billed_by: string;
  /** UPI / card transaction reference */
  txn_ref: string;
  /** yyyy-mm-dd */
  bill_date: string;
  created_at: string;
  /** Sum of MRP x qty */
  sub_total: number;
  /** Sum of (MRP - selling) x qty */
  discount: number;
  /** Payable minus the GST already contained in it */
  taxable_amount: number;
  /** GST contained inside the selling price */
  gst_amount: number;
  /** Weighted average GST rate across the lines */
  gst_percent: number;
  /** Payable = sum of selling x qty */
  grand_total: number;
  received_amount: number;
  change_amount: number;
  payment_method: PaymentMethod;
  status: "COMPLETED" | "HELD";
  mode: Mode | null;
  /** Settled so far (checkout + later receipts) */
  paid_amount: number;
  /** Still owed on a credit bill */
  due_amount: number;
  due_date: string | null;
  returned_amount: number;
  shipping_address: string;
  customer_gstin: string;
  items: BillItem[];
};

/** A row in the billing cart before the bill is saved */
export type CartLine = {
  key: string;
  medicine_id: string;
  batch_id: string;
  generic_name: string;
  brand_name: string;
  manufacturer: string;
  salt: string;
  schedule: DrugSchedule;
  /** Tablet / Injection / General / … (Settings → Product Types); "" = not set */
  product_type: string;
  hsn_code: string;
  batch_no: string;
  mfg_date: string;
  exp_date: string;
  box: string;
  purchase_unit_type: PurchaseUnitType;
  pack_size: number;
  qty: number;
  mrp_per_unit: number;
  per_unit_price: number;
  selling_price_pack: number;
  mrp_pack: number;
  gst_percent: number;
  stock_available: number;
};

/** A bill parked with "Hold Bill (F6)" */
export type HeldBill = {
  id: string;
  at: string;
  lines: CartLine[];
  /** Dashboard the bill was held in (absent on bills held before the split = retail counter). */
  mode?: Mode;
};

export type ShopSettings = {
  shop_name: string;
  full_name: string;
  address: string;
  phone: string;
  shop_contact_number: string;
  email: string;
  gstin: string;
  dl_no: string;
  colour_theme: string;
  logo: string;
  /** When false the app ignores `logo` and keeps the logo already in place. */
  use_custom_logo: boolean;
  instagram_id: string;
  default_gst: number;
  low_stock_threshold: number;
  expiry_alert_months: number;
  /** Product types offered for medicines (Settings → Product Types) */
  product_types: string[];
  /** Purchase units offered for batches (Settings → Purchase Units) */
  purchase_units: string[];
};

export type Store = {
  medicines: Medicine[];
  suppliers: Supplier[];
  batches: Batch[];
  customers: Customer[];
  bills: Bill[];
  held: HeldBill[];
  settings: ShopSettings;
  counters: {
    bill: number;
    customer: number;
  };
};

export type BatchRow = { batch: Batch; medicine: Medicine; supplier_name: string };

/** Wholesale quantity discount: `percent` off once a line reaches `min_packs`. */
export type DiscountTier = { min_packs: number; percent: number };

/** Bill offer: `percent` off the whole bill once it reaches `min_amount` (₹). */
export type BillOffer = { min_amount: number; percent: number };

/** Settings that differ between the retail and wholesale dashboards. */
export type ModeSettings = {
  mode: Mode;
  invoice_prefix: string;
  payment_methods: PaymentMethod[];
  allow_credit: boolean;
  default_credit_days: number;
  /** 0 = use each medicine's own threshold */
  low_stock_threshold: number;
  /** 0 = use the shop-wide setting */
  expiry_alert_months: number;
  /** Cap on manual bill discount % (0 = no cap) */
  max_discount_percent: number;
  bulk_discount_tiers: DiscountTier[];
  /** Applied automatically at billing; the best offer the bill qualifies for wins */
  bill_offers: BillOffer[];
  enforce_moq: boolean;
  invoice_terms: string;
  /** Offer pop-up shown on the customer invoice link */
  invoice_promo: InvoicePromo;
  /** Automatic % off by product type, banded by that type's total on the bill */
  type_discounts: TypeDiscountRule[];
  /** This mode's GSTIN and drug licence number, printed on its invoices */
  gstin: string;
  dl_no: string;
  /** This mode's shop identity, printed on its invoices (blank = shop-wide value) */
  shop_name: string;
  full_name: string;
  address: string;
  phone: string;
  shop_contact_number: string;
  email: string;
  default_gst: number;
};

/** Shop settings as seen from one dashboard: shared shop details + that mode's settings. */
export type ScopedSettings = ShopSettings & { mode_settings: ModeSettings };

export type Payment = {
  id: string;
  mode: Mode;
  party_type: "customer" | "supplier";
  customer_id: string | null;
  supplier_id: string | null;
  bill_id: string | null;
  invoice_no: string;
  amount: number;
  method: string;
  reference: string;
  note: string;
  paid_on: string;
  created_at: string;
};

export type SalesReturnItem = {
  bill_item_id: string;
  batch_id: string;
  generic_name: string;
  batch_no: string;
  qty: number;
  amount: number;
};

export type SalesReturn = {
  id: string;
  mode: Mode;
  bill_id: string;
  customer_id: string | null;
  items: SalesReturnItem[];
  amount: number;
  adjusted_against_due: number;
  refund_amount: number;
  refund_method: string;
  reason: string;
  created_at: string;
};

export type PurchaseReturn = {
  id: string;
  mode: Mode;
  supplier_id: string | null;
  batch_id: string;
  medicine_id: string | null;
  generic_name: string;
  batch_no: string;
  qty: number;
  amount: number;
  reason: string;
  created_at: string;
};

export type PurchaseOrderItem = {
  medicine_id: string;
  generic_name: string;
  packs: number;
  pack_size: number;
  rate: number;
};

export type PurchaseOrder = {
  id: string;
  mode: Mode;
  po_no: string;
  supplier_id: string | null;
  order_date: string;
  expected_date: string | null;
  status: "ORDERED" | "RECEIVED" | "CANCELLED";
  items: PurchaseOrderItem[];
  notes: string;
  created_at: string;
};

export type StockMovement = {
  id: string;
  mode: Mode | null;
  batch_id: string | null;
  medicine_id: string | null;
  type: string;
  qty_change: number;
  balance_after: number;
  reference: string;
  note: string;
  actor: string;
  created_at: string;
};

/** Counts of legacy rows that still need a retail / wholesale decision. */
export type ReconciliationSummary = {
  batches: BatchRow[];
  bills: number;
  customers: number;
  suppliers: number;
};

/** Everything the payments / ledgers screens need for one dashboard. */
export type LedgerData = {
  payments: Payment[];
  salesReturns: SalesReturn[];
  purchaseReturns: PurchaseReturn[];
  purchaseOrders: PurchaseOrder[];
};
