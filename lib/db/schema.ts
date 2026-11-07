import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  date,
  timestamp,
  pgSequence,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";


export const customerSeq = pgSequence("customer_seq", { startWith: 1 });
/** Retail invoice numbers. Kept as the original sequence so existing numbering continues. */
export const billSeq = pgSequence("bill_seq", { startWith: 1 });
/** Wholesale invoice numbers run on their own counter (prefixed, see mode_settings). */
export const wholesaleBillSeq = pgSequence("wholesale_bill_seq", { startWith: 1 });
export const purchaseOrderSeq = pgSequence("purchase_order_seq", { startWith: 1 });

/* --------------------------------------------------------------------------
   Operating mode

   Every business record (stock, bills, customers, suppliers, payments …)
   belongs to exactly one mode: "retail" or "wholesale". Rows that existed
   before the split carry NULL — "unclassified" — until an admin assigns them
   from Settings → Reconciliation. The medicine catalogue has no mode: it is
   shared by both dashboards.
   -------------------------------------------------------------------------- */

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  gstin: text("gstin").notNull().default(""),
  /** "retail" | "wholesale" | NULL (legacy, awaiting reconciliation) */
  mode: text("mode"),
  address: text("address").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const medicines = pgTable(
  "medicines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    genericName: text("generic_name").notNull(),
    brandName: text("brand_name").notNull().default(""),
    manufacturer: text("manufacturer").notNull().default(""),
    salt: text("salt").notNull().default(""),
    schedule: text("schedule").notNull(),
    /** Product type from Settings → Product Types, e.g. "Tablet", "Injection" */
    productType: text("product_type").notNull().default(""),
    hsnCode: text("hsn_code").notNull().default(""),
    gstPercent: numeric("gst_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    purchaseUnitType: text("purchase_unit_type").notNull(),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(20),
    /** Optional EAN / UPC printed on the pack — matched by the barcode scanner. */
    barcode: text("barcode").notNull().default(""),
    /** Minimum wholesale order quantity in packs (0 = no minimum). */
    wholesaleMoq: integer("wholesale_moq").notNull().default(0),
    /** Products with transaction history are archived instead of deleted. */
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("medicines_generic_idx").on(table.genericName)],
);

export const batches = pgTable(
  "batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    medicineId: uuid("medicine_id")
      .notNull()
      .references(() => medicines.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    /** Brand name for this specific batch / purchase (e.g. "Azicip") */
    brandName: text("brand_name").notNull().default(""),
    /** Manufacturer for this specific batch (e.g. "Cipla Ltd") */
    manufacturer: text("manufacturer").notNull().default(""),
    invoiceNo: text("invoice_no").notNull().default(""),
    purchaseDate: date("purchase_date").notNull(),
    batchNo: text("batch_no").notNull(),
    mfgDate: text("mfg_date").notNull().default(""),
    expDate: text("exp_date").notNull().default(""),
    box: text("box").notNull().default(""),
    purchaseUnitType: text("purchase_unit_type").notNull(),
    packSize: integer("pack_size").notNull().default(1),
    /** Packs (strips) in one box; 0 = not sold by the box */
    stripsPerBox: integer("strips_per_box").notNull().default(0),
    qtyPacks: integer("qty_packs").notNull().default(0),
    stockAdded: integer("stock_added").notNull().default(0),
    stockQty: integer("stock_qty").notNull().default(0),
    /** Removed from Inventory but kept, because bills / returns / transfers refer to it */
    archived: boolean("archived").notNull().default(false),
    purchaseRate: numeric("purchase_rate", { precision: 12, scale: 2 }).notNull().default("0"),
    mrp: numeric("mrp", { precision: 12, scale: 2 }).notNull().default("0"),
    sellingPrice: numeric("selling_price", { precision: 12, scale: 2 }).notNull().default("0"),
    gstPercent: numeric("gst_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    /** "retail" | "wholesale" | NULL (legacy stock awaiting reconciliation) */
    mode: text("mode"),
    /** Set when this batch was created by a stock transfer: the batch it came from (same batch no. / expiry / cost). */
    sourceBatchId: uuid("source_batch_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("batches_medicine_idx").on(table.medicineId),
    index("batches_exp_idx").on(table.expDate),
    index("batches_mode_idx").on(table.mode),
  ],
);

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  doctorName: text("doctor_name").notNull().default(""),
  email: text("email").notNull().default(""),
  /** Wholesale: the distributor's contact person and drug licence number */
  contactPerson: text("contact_person").notNull().default(""),
  dlNo: text("dl_no").notNull().default(""),
  age: text("age").notNull().default(""),
  gender: text("gender").notNull().default(""),
  quickBill: boolean("quick_bill").notNull().default(false),
  /** "retail" | "wholesale" | NULL (legacy, awaiting reconciliation) */
  mode: text("mode"),
  /** Wholesale buyer type: Retailer / Medical shop / Clinic / Hospital / Distributor / Other */
  businessType: text("business_type").notNull().default(""),
  gstin: text("gstin").notNull().default(""),
  shippingAddress: text("shipping_address").notNull().default(""),
  /** 0 = no limit */
  creditLimit: numeric("credit_limit", { precision: 12, scale: 2 }).notNull().default("0"),
  /** Payment terms in days for credit bills (0 = use the mode default). */
  creditDays: integer("credit_days").notNull().default(0),
  /** Customer-specific price discount, % off the mode selling price. */
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bills = pgTable(
  "bills",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
    customerName: text("customer_name").notNull().default(""),
    customerPhone: text("customer_phone").notNull().default(""),
    customerAddress: text("customer_address").notNull().default(""),
    doctorName: text("doctor_name").notNull().default(""),
    customerEmail: text("customer_email").notNull().default(""),
    customerAge: text("customer_age").notNull().default(""),
    customerGender: text("customer_gender").notNull().default(""),
    /** Typed in at checkout and printed on the invoice header. */
    prescriptionNo: text("prescription_no").notNull().default(""),
    billedBy: text("billed_by").notNull().default(""),
    /** UPI / card transaction reference, printed in the totals block. */
    txnRef: text("txn_ref").notNull().default(""),
    billDate: date("bill_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    subTotal: numeric("sub_total", { precision: 12, scale: 2 }).notNull(),
    discount: numeric("discount", { precision: 12, scale: 2 }).notNull(),
    taxableAmount: numeric("taxable_amount", { precision: 12, scale: 2 }).notNull(),
    gstAmount: numeric("gst_amount", { precision: 12, scale: 2 }).notNull(),
    gstPercent: numeric("gst_percent", { precision: 5, scale: 2 }).notNull(),
    grandTotal: numeric("grand_total", { precision: 12, scale: 2 }).notNull(),
    receivedAmount: numeric("received_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    changeAmount: numeric("change_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    paymentMethod: text("payment_method").notNull(),
    status: text("status").notNull().default("COMPLETED"),
    /** "retail" | "wholesale" | NULL (legacy, awaiting reconciliation) */
    mode: text("mode"),
    /** Amount settled against this bill (at checkout + later receipts). */
    paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    /** Outstanding on credit bills. Zero for fully paid bills. */
    dueAmount: numeric("due_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    dueDate: date("due_date"),
    /** Value of goods returned against this bill. */
    returnedAmount: numeric("returned_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    /** Automatic category-wise discount on this bill, and the slab that chose it (snapshot) */
    autoDiscount: numeric("auto_discount", { precision: 12, scale: 2 }).notNull().default("0"),
    autoSlab: text("auto_slab").notNull().default(""),
    /** MRP value of the free items given by offers on this bill */
    offerSavings: numeric("offer_savings", { precision: 12, scale: 2 }).notNull().default("0"),
    /** Offer discounts taken off paid lines on this bill */
    promoDiscount: numeric("promo_discount", { precision: 12, scale: 2 }).notNull().default("0"),
    shippingAddress: text("shipping_address").notNull().default(""),
    customerGstin: text("customer_gstin").notNull().default(""),
    /** Idempotency key from the billing screen — a double-submit returns the first bill. */
    clientRef: text("client_ref"),
  },
  (table) => [
    index("bills_created_idx").on(table.createdAt),
    index("bills_customer_idx").on(table.customerId),
    index("bills_mode_idx").on(table.mode),
    uniqueIndex("bills_client_ref_idx").on(table.clientRef),
  ],
);

export const billItems = pgTable(
  "bill_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billId: text("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    medicineId: uuid("medicine_id"),
    batchId: uuid("batch_id"),
    genericName: text("generic_name").notNull(),
    brandName: text("brand_name").notNull().default(""),
    manufacturer: text("manufacturer").notNull().default(""),
    schedule: text("schedule").notNull(),
    /** Product type from Settings → Product Types, e.g. "Tablet", "Injection" */
    productType: text("product_type").notNull().default(""),
    hsnCode: text("hsn_code").notNull().default(""),
    batchNo: text("batch_no").notNull().default(""),
    mfgDate: text("mfg_date").notNull().default(""),
    expDate: text("exp_date").notNull().default(""),
    box: text("box").notNull().default(""),
    purchaseUnitType: text("purchase_unit_type").notNull(),
    packSize: integer("pack_size").notNull().default(1),
    qty: integer("qty").notNull(),
    mrpPerUnit: numeric("mrp_per_unit", { precision: 12, scale: 2 }).notNull(),
    perUnitPrice: numeric("per_unit_price", { precision: 12, scale: 2 }).notNull(),
    lineMrp: numeric("line_mrp", { precision: 12, scale: 2 }).notNull(),
    lineAmount: numeric("line_amount", { precision: 12, scale: 2 }).notNull(),
    lineDiscount: numeric("line_discount", { precision: 12, scale: 2 }).notNull(),
    gstPercent: numeric("gst_percent", { precision: 5, scale: 2 }).notNull(),
    /** Purchase cost per unit at the time of sale — used for margin reports. */
    costPerUnit: numeric("cost_per_unit", { precision: 12, scale: 2 }).notNull().default("0"),
    /** Units already returned against this line. */
    returnedQty: integer("returned_qty").notNull().default(0),
    /** Automatic discount on this line: category, % and ₹ as billed (snapshot) */
    autoCategory: text("auto_category").notNull().default(""),
    autoPercent: numeric("auto_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    autoDiscount: numeric("auto_discount", { precision: 12, scale: 2 }).notNull().default("0"),
    /** Offer discount taken off this line (price offers, discounted rewards) */
    promoDiscount: numeric("promo_discount", { precision: 12, scale: 2 }).notNull().default("0"),
    /** Free item given by an offer (₹0 line), and the offer — kept even if the offer is later edited or deleted */
    isFree: boolean("is_free").notNull().default(false),
    offerId: uuid("offer_id"),
    offerName: text("offer_name").notNull().default(""),
  },
  (table) => [index("bill_items_bill_idx").on(table.billId)],
);

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  shopName: text("shop_name").notNull(),
  fullName: text("full_name").notNull().default(""),
  address: text("address").notNull(),
  phone: text("phone").notNull(),
  shopContactNumber: text("shop_contact_number").notNull().default(""),
  email: text("email").notNull().default(""),
  gstin: text("gstin").notNull(),
  dlNo: text("dl_no").notNull(),
  colourTheme: text("colour_theme").notNull().default("green"),
  logo: text("logo").notNull().default(""),
  /** Off by default: the app keeps showing the logo that is present until the
      owner deliberately opts into the custom one from Settings. */
  useCustomLogo: boolean("use_custom_logo").notNull().default(false),
  instagramId: text("instagram_id").notNull().default(""),
  defaultGst: numeric("default_gst", { precision: 5, scale: 2 }).notNull().default("12"),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(20),
  expiryAlertMonths: integer("expiry_alert_months").notNull().default(6),
  /** JSON list of product types offered when adding medicines ("" = the defaults) */
  productTypes: text("product_types").notNull().default(""),
  /** JSON list of purchase units (Strip, Piece, Bottle…) ("" = the defaults) */
  purchaseUnits: text("purchase_units").notNull().default(""),
});

/* --------------------------------------------------------------------------
   Per-mode settings (one row each for "retail" and "wholesale").
   -------------------------------------------------------------------------- */
export const modeSettings = pgTable("mode_settings", {
  mode: text("mode").primaryKey(),
  invoicePrefix: text("invoice_prefix").notNull().default(""),
  /** Comma separated, e.g. "Cash,UPI,Card,Credit" */
  paymentMethods: text("payment_methods").notNull().default("Cash,UPI,Card"),
  allowCredit: boolean("allow_credit").notNull().default(false),
  defaultCreditDays: integer("default_credit_days").notNull().default(0),
  /** 0 = use each medicine's own threshold */
  lowStockThreshold: integer("low_stock_threshold").notNull().default(0),
  /** 0 = use the shop-wide setting */
  expiryAlertMonths: integer("expiry_alert_months").notNull().default(0),
  /** Highest manual discount % staff may give on a bill (0 = no cap). */
  maxDiscountPercent: numeric("max_discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  /** JSON: [{ "min_packs": 50, "percent": 2 }] — wholesale quantity discounts */
  bulkDiscountTiers: text("bulk_discount_tiers").notNull().default("[]"),
  /** JSON: [{ "min_amount": 600, "percent": 5 }] — automatic % off once the bill reaches the amount */
  billOffers: text("bill_offers").notNull().default("[]"),
  enforceMoq: boolean("enforce_moq").notNull().default(false),
  /** Printed under "Terms & Conditions" on this mode's invoices; one per line. */
  invoiceTerms: text("invoice_terms").notNull().default(""),
  /** JSON: offer pop-up on customer invoice links (see lib/promo.ts); "" = default, switched off */
  invoicePromo: text("invoice_promo").notNull().default(""),
  /** Stock alerts (low / out of stock / expiry): show the pop-up, and ring the alarm sound */
  alertPopup: boolean("alert_popup").notNull().default(true),
  alertSound: boolean("alert_sound").notNull().default(true),
  /** JSON: automatic discounts by product type (see lib/type-discounts.ts) */
  typeDiscounts: text("type_discounts").notNull().default("[]"),
  /** JSON: automatic category-wise discounts by bill slab (lib/auto-discounts.ts); "" = not set up */
  autoDiscounts: text("auto_discounts").notNull().default(""),
  /** GSTIN and drug licence number printed on this mode's invoices. */
  gstin: text("gstin").notNull().default(""),
  dlNo: text("dl_no").notNull().default(""),
  /* Shop identity printed on this mode's invoices (blank = shop-wide value). */
  shopName: text("shop_name").notNull().default(""),
  fullName: text("full_name").notNull().default(""),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  shopContactNumber: text("shop_contact_number").notNull().default(""),
  email: text("email").notNull().default(""),
  /** Default GST % for new purchases in this mode. */
  defaultGst: numeric("default_gst", { precision: 5, scale: 2 }).notNull().default("12"),
});

/* --------------------------------------------------------------------------
   Stock ledger — every change to a batch's quantity is recorded here.
   -------------------------------------------------------------------------- */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mode: text("mode"),
    batchId: uuid("batch_id"),
    medicineId: uuid("medicine_id"),
    /** PURCHASE | SALE | SALE_RETURN | SALE_VOID | PURCHASE_RETURN | ADJUSTMENT | DAMAGED | EXPIRED | RECLASSIFY | EDIT */
    type: text("type").notNull(),
    qtyChange: integer("qty_change").notNull().default(0),
    balanceAfter: integer("balance_after").notNull().default(0),
    reference: text("reference").notNull().default(""),
    note: text("note").notNull().default(""),
    actor: text("actor").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("stock_movements_batch_idx").on(table.batchId),
    index("stock_movements_mode_idx").on(table.mode),
  ],
);

/* --------------------------------------------------------------------------
   Payments — customer receipts against bills and payments made to suppliers.
   -------------------------------------------------------------------------- */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mode: text("mode").notNull(),
    /** "customer" (money in) | "supplier" (money out) */
    partyType: text("party_type").notNull(),
    customerId: text("customer_id"),
    supplierId: uuid("supplier_id"),
    billId: text("bill_id"),
    /** Supplier invoice number the payment is against (optional). */
    invoiceNo: text("invoice_no").notNull().default(""),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    method: text("method").notNull().default("Cash"),
    reference: text("reference").notNull().default(""),
    note: text("note").notNull().default(""),
    paidOn: date("paid_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("payments_mode_idx").on(table.mode)],
);

/* --------------------------------------------------------------------------
   Sales returns (against a bill) and purchase returns (back to a supplier).
   -------------------------------------------------------------------------- */
export const salesReturns = pgTable(
  "sales_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mode: text("mode").notNull(),
    billId: text("bill_id").notNull(),
    customerId: text("customer_id"),
    /** JSON: [{ bill_item_id, batch_id, generic_name, batch_no, qty, amount }] */
    items: text("items").notNull().default("[]"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    /** Part of the amount that reduced the bill's outstanding. */
    adjustedAgainstDue: numeric("adjusted_against_due", { precision: 12, scale: 2 }).notNull().default("0"),
    refundAmount: numeric("refund_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    refundMethod: text("refund_method").notNull().default("Cash"),
    reason: text("reason").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sales_returns_mode_idx").on(table.mode)],
);

export const purchaseReturns = pgTable(
  "purchase_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mode: text("mode").notNull(),
    supplierId: uuid("supplier_id"),
    batchId: uuid("batch_id").notNull(),
    medicineId: uuid("medicine_id"),
    genericName: text("generic_name").notNull().default(""),
    batchNo: text("batch_no").notNull().default(""),
    qty: integer("qty").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    reason: text("reason").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("purchase_returns_mode_idx").on(table.mode)],
);

/* --------------------------------------------------------------------------
   Purchase orders — what was ordered from a supplier before goods arrive.
   -------------------------------------------------------------------------- */
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mode: text("mode").notNull(),
    poNo: text("po_no").notNull(),
    supplierId: uuid("supplier_id"),
    orderDate: date("order_date").notNull(),
    expectedDate: date("expected_date"),
    /** ORDERED | RECEIVED | CANCELLED */
    status: text("status").notNull().default("ORDERED"),
    /** JSON: [{ medicine_id, generic_name, packs, pack_size, rate }] */
    items: text("items").notNull().default("[]"),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("purchase_orders_mode_idx").on(table.mode)],
);

/* --------------------------------------------------------------------------
   App users — one login system with two roles. Retail / wholesale are not
   roles: `modes` lists the dashboards a staff account may open (admins get
   both). Passcodes are stored only as a scrypt hash.
   -------------------------------------------------------------------------- */
export const appUsers = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** "admin" | "staff" */
  role: text("role").notNull().default("staff"),
  passcodeHash: text("passcode_hash").notNull().unique(),
  /** Comma separated: "retail", "wholesale" or "retail,wholesale" */
  modes: text("modes").notNull().default("retail,wholesale"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------------------------------------------------------------
   Built-in login passcodes changed from Settings → Login passcodes.
   One row per role ("admin", "staff"); a row replaces the ADMIN_PASSCODE /
   STAFF_PASSCODE environment value. No row = the environment value works.
   -------------------------------------------------------------------------- */
export const loginPasscodes = pgTable("login_passcodes", {
  role: text("role").primaryKey(),
  passcodeHash: text("passcode_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------------------------------------------------------------
   Offers & free gifts (Settings → Offers; retail). See lib/offers.ts.
   Bills keep the offer name on their free lines, so editing or deleting an
   offer never changes old invoices.
   -------------------------------------------------------------------------- */
export const offers = pgTable("offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  mode: text("mode").notNull().default("retail"),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  /** "buy_get" | "bill_gift" | "price_off" */
  type: text("type").notNull(),
  buyMedicineId: uuid("buy_medicine_id"),
  /** Any product of this Product Type qualifies ("" = use buy_medicine_id) */
  buyCategory: text("buy_category").notNull().default(""),
  buyQty: integer("buy_qty").notNull().default(1),
  rewardMedicineId: uuid("reward_medicine_id"),
  rewardQty: integer("reward_qty").notNull().default(1),
  /** JSON list of other products the counter may give instead */
  rewardChoices: text("reward_choices").notNull().default("[]"),
  /** "free" | "percent" | "price" and its value (% off, or ₹ per pack) */
  rewardMode: text("reward_mode").notNull().default("free"),
  rewardValue: numeric("reward_value", { precision: 12, scale: 2 }).notNull().default("0"),
  /** price_off: "percent" | "amount" | "price" and its value */
  offMode: text("off_mode").notNull().default("percent"),
  offValue: numeric("off_value", { precision: 12, scale: 2 }).notNull().default("0"),
  minBill: numeric("min_bill", { precision: 12, scale: 2 }).notNull().default("0"),
  repeatable: boolean("repeatable").notNull().default(true),
  maxFreePerBill: integer("max_free_per_bill").notNull().default(0),
  /** 0 = no limit */
  maxPerCustomer: integer("max_per_customer").notNull().default(0),
  maxTotal: integer("max_total").notNull().default(0),
  startsOn: text("starts_on").notNull().default(""),
  endsOn: text("ends_on").notNull().default(""),
  active: boolean("active").notNull().default(true),
  /** Off = the counter must accept it on the bill */
  autoApply: boolean("auto_apply").notNull().default(true),
  /** Let the automatic category discount also apply to lines this offer discounts */
  stackAuto: boolean("stack_auto").notNull().default(false),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
