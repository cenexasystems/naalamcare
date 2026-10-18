import type {
  Batch,
  Bill,
  BillItem,
  Customer,
  DiscountTier,
  Medicine,
  ModeSettings,
  Payment,
  PaymentMethod,
  PurchaseOrder,
  PurchaseReturn,
  SalesReturn,
  ShopSettings,
  StockMovement,
  Supplier,
} from "../types";
import { isMode, type Mode } from "../mode";

const modeOrNull = (value: unknown): Mode | null => (isMode(value) ? value : null);

const parseJson = <T,>(raw: unknown, fallback: T): T => {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const iso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : String(value ?? "");

export const toNum = (val: string | number | null | undefined): number => {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  return Number(val) || 0;
};

export const mapMedicine = (row: any): Medicine => ({
  id: row.id,
  generic_name: row.genericName,
  brand_name: row.brandName,
  manufacturer: row.manufacturer,
  salt: row.salt,
  schedule: row.schedule as any,
  hsn_code: row.hsnCode,
  gst_percent: toNum(row.gstPercent),
  purchase_unit_type: row.purchaseUnitType as any,
  low_stock_threshold: row.lowStockThreshold,
  barcode: row.barcode ?? "",
  wholesale_moq: row.wholesaleMoq ?? 0,
  archived: Boolean(row.archived),
  created_at: row.createdAt.toISOString(),
});

export const mapBatch = (row: any): Batch => ({
  id: row.id,
  medicine_id: row.medicineId,
  supplier_id: row.supplierId,
  brand_name: row.brandName ?? "",
  manufacturer: row.manufacturer ?? "",
  invoice_no: row.invoiceNo,
  purchase_date: row.purchaseDate,
  batch_no: row.batchNo,
  mfg_date: row.mfgDate,
  exp_date: row.expDate,
  box: row.box,
  purchase_unit_type: row.purchaseUnitType as any,
  pack_size: row.packSize,
  qty_packs: row.qtyPacks,
  stock_added: row.stockAdded,
  stock_qty: row.stockQty,
  purchase_rate: toNum(row.purchaseRate),
  mrp: toNum(row.mrp),
  selling_price: toNum(row.sellingPrice),
  gst_percent: toNum(row.gstPercent),
  mode: modeOrNull(row.mode),
  source_batch_id: row.sourceBatchId ?? null,
  created_at: row.createdAt.toISOString(),
});

export const mapCustomer = (row: any): Customer => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  address: row.address,
  doctor_name: row.doctorName,
  email: row.email || "",
  age: row.age || "",
  gender: row.gender || "",
  quick_bill: row.quickBill,
  mode: modeOrNull(row.mode),
  business_type: row.businessType || "",
  gstin: row.gstin || "",
  shipping_address: row.shippingAddress || "",
  credit_limit: toNum(row.creditLimit),
  credit_days: row.creditDays ?? 0,
  discount_percent: toNum(row.discountPercent),
  created_at: row.createdAt.toISOString(),
});

export const mapSupplier = (row: any): Supplier => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  gstin: row.gstin,
  address: row.address || "",
  mode: modeOrNull(row.mode),
  created_at: row.createdAt.toISOString(),
});

export const mapBillItem = (row: any): BillItem => ({
  id: row.id,
  bill_id: row.billId,
  medicine_id: row.medicineId || "",
  batch_id: row.batchId || "",
  generic_name: row.genericName,
  brand_name: row.brandName,
  manufacturer: row.manufacturer,
  schedule: row.schedule as any,
  hsn_code: row.hsnCode,
  batch_no: row.batchNo,
  mfg_date: row.mfgDate,
  exp_date: row.expDate,
  box: row.box,
  purchase_unit_type: row.purchaseUnitType as any,
  pack_size: row.packSize,
  qty: row.qty,
  mrp_per_unit: toNum(row.mrpPerUnit),
  per_unit_price: toNum(row.perUnitPrice),
  line_mrp: toNum(row.lineMrp),
  line_amount: toNum(row.lineAmount),
  line_discount: toNum(row.lineDiscount),
  gst_percent: toNum(row.gstPercent),
  cost_per_unit: toNum(row.costPerUnit),
  returned_qty: row.returnedQty ?? 0,
});

export const mapBill = (row: any, items: any[] = []): Bill => ({
  id: row.id,
  customer_id: row.customerId,
  customer_name: row.customerName,
  customer_phone: row.customerPhone,
  customer_address: row.customerAddress,
  doctor_name: row.doctorName,
  customer_email: row.customerEmail || "",
  customer_age: row.customerAge || "",
  customer_gender: row.customerGender || "",
  prescription_no: row.prescriptionNo || "",
  billed_by: row.billedBy || "",
  txn_ref: row.txnRef || "",
  bill_date: row.billDate,
  created_at: row.createdAt.toISOString(),
  sub_total: toNum(row.subTotal),
  discount: toNum(row.discount),
  taxable_amount: toNum(row.taxableAmount),
  gst_amount: toNum(row.gstAmount),
  gst_percent: toNum(row.gstPercent),
  grand_total: toNum(row.grandTotal),
  received_amount: toNum(row.receivedAmount),
  change_amount: toNum(row.changeAmount),
  payment_method: row.paymentMethod as any,
  status: row.status as any,
  mode: modeOrNull(row.mode),
  paid_amount: toNum(row.paidAmount),
  due_amount: toNum(row.dueAmount),
  due_date: row.dueDate || null,
  returned_amount: toNum(row.returnedAmount),
  shipping_address: row.shippingAddress || "",
  customer_gstin: row.customerGstin || "",
  items: items.map(mapBillItem),
});

export const mapSettings = (row: any): ShopSettings => ({
  shop_name: row.shopName,
  full_name: row.fullName || "",
  address: row.address,
  phone: row.phone,
  shop_contact_number: row.shopContactNumber || "",
  email: row.email || "",
  gstin: row.gstin,
  dl_no: row.dlNo,
  colour_theme: row.colourTheme || "green",
  logo: row.logo || "",
  use_custom_logo: Boolean(row.useCustomLogo),
  instagram_id: row.instagramId || "",
  default_gst: toNum(row.defaultGst),
  low_stock_threshold: row.lowStockThreshold,
  expiry_alert_months: row.expiryAlertMonths,
});

export const mapModeSettings = (row: any, mode: Mode): ModeSettings => ({
  mode,
  invoice_prefix: row?.invoicePrefix ?? (mode === "wholesale" ? "W" : ""),
  payment_methods: String(row?.paymentMethods ?? "Cash,UPI,Card")
    .split(",")
    .map((m: string) => m.trim())
    .filter(Boolean) as PaymentMethod[],
  allow_credit: Boolean(row?.allowCredit ?? mode === "wholesale"),
  default_credit_days: row?.defaultCreditDays ?? (mode === "wholesale" ? 30 : 0),
  low_stock_threshold: row?.lowStockThreshold ?? 0,
  expiry_alert_months: row?.expiryAlertMonths ?? 0,
  max_discount_percent: toNum(row?.maxDiscountPercent),
  bulk_discount_tiers: parseJson<DiscountTier[]>(row?.bulkDiscountTiers, [])
    .map((t) => ({ min_packs: toNum(t.min_packs), percent: toNum(t.percent) }))
    .filter((t) => t.min_packs > 0 && t.percent > 0)
    .sort((a, b) => a.min_packs - b.min_packs),
  enforce_moq: Boolean(row?.enforceMoq ?? mode === "wholesale"),
  invoice_terms: row?.invoiceTerms ?? "",
  gstin: row?.gstin ?? "",
  dl_no: row?.dlNo ?? "",
  shop_name: row?.shopName ?? "",
  full_name: row?.fullName ?? "",
  address: row?.address ?? "",
  phone: row?.phone ?? "",
  shop_contact_number: row?.shopContactNumber ?? "",
  email: row?.email ?? "",
  default_gst: row?.defaultGst != null ? toNum(row.defaultGst) : 12,
});

export const mapPayment = (row: any): Payment => ({
  id: row.id,
  mode: row.mode,
  party_type: row.partyType,
  customer_id: row.customerId ?? null,
  supplier_id: row.supplierId ?? null,
  bill_id: row.billId ?? null,
  invoice_no: row.invoiceNo || "",
  amount: toNum(row.amount),
  method: row.method,
  reference: row.reference || "",
  note: row.note || "",
  paid_on: row.paidOn,
  created_at: iso(row.createdAt),
});

export const mapSalesReturn = (row: any): SalesReturn => ({
  id: row.id,
  mode: row.mode,
  bill_id: row.billId,
  customer_id: row.customerId ?? null,
  items: parseJson(row.items, []),
  amount: toNum(row.amount),
  adjusted_against_due: toNum(row.adjustedAgainstDue),
  refund_amount: toNum(row.refundAmount),
  refund_method: row.refundMethod,
  reason: row.reason || "",
  created_at: iso(row.createdAt),
});

export const mapPurchaseReturn = (row: any): PurchaseReturn => ({
  id: row.id,
  mode: row.mode,
  supplier_id: row.supplierId ?? null,
  batch_id: row.batchId,
  medicine_id: row.medicineId ?? null,
  generic_name: row.genericName || "",
  batch_no: row.batchNo || "",
  qty: row.qty,
  amount: toNum(row.amount),
  reason: row.reason || "",
  created_at: iso(row.createdAt),
});

export const mapPurchaseOrder = (row: any): PurchaseOrder => ({
  id: row.id,
  mode: row.mode,
  po_no: row.poNo,
  supplier_id: row.supplierId ?? null,
  order_date: row.orderDate,
  expected_date: row.expectedDate ?? null,
  status: row.status,
  items: parseJson(row.items, []),
  notes: row.notes || "",
  created_at: iso(row.createdAt),
});

export const mapStockMovement = (row: any): StockMovement => ({
  id: row.id,
  mode: modeOrNull(row.mode),
  batch_id: row.batchId ?? null,
  medicine_id: row.medicineId ?? null,
  type: row.type,
  qty_change: row.qtyChange,
  balance_after: row.balanceAfter,
  reference: row.reference || "",
  note: row.note || "",
  actor: row.actor || "",
  created_at: iso(row.createdAt),
});
