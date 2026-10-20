/* ==========================================================================
   Calculation rules — exactly as specified by the client (slides 13, 14, 15)
   ==========================================================================

   Stock Added     = Purchase Unit  x  Quantity
   Total (Rs)      = MRP            x  Quantity
   Per Unit Price  = Selling Price  /  Purchase Unit
   Selling Price   = Per Unit Price x  Purchase Unit
   Discount        = MRP            -  Selling Price

   GST is INCLUDED in both MRP and Selling Price. The GST % is shown only to
   indicate the applicable tax rate — nothing is ever added on top.
   ========================================================================== */

export const round2 = (n: number): number =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Stock Added = Purchase Unit x Quantity */
export const calcStockAdded = (packSize: number | string, qtyPacks: number | string): number =>
  round2(num(packSize) * num(qtyPacks));

/** Total (Rs) = MRP x Quantity */
export const calcTotal = (mrp: number | string, qtyPacks: number | string): number =>
  round2(num(mrp) * num(qtyPacks));

/** Per Unit Price = Selling Price / Purchase Unit */
export const calcPerUnitPrice = (
  sellingPrice: number | string,
  packSize: number | string,
): number => {
  const size = num(packSize);
  if (size <= 0) return 0;
  return round2(num(sellingPrice) / size);
};

/** Selling Price = Per Unit Price x Purchase Unit */
export const calcSellingPrice = (
  perUnitPrice: number | string,
  packSize: number | string,
): number => round2(num(perUnitPrice) * num(packSize));

/** Discount = MRP - Selling Price */
export const calcDiscount = (mrp: number | string, sellingPrice: number | string): number =>
  round2(num(mrp) - num(sellingPrice));

/** Discount as a percentage of MRP */
export const calcDiscountPercent = (
  mrp: number | string,
  sellingPrice: number | string,
): number => {
  const m = num(mrp);
  if (m <= 0) return 0;
  return round2(((m - num(sellingPrice)) / m) * 100);
};

/** Total purchase cost = Purchase Rate x Quantity */
export const calcPurchaseCost = (
  purchaseRate: number | string,
  qtyPacks: number | string,
): number => round2(num(purchaseRate) * num(qtyPacks));

/**
 * GST already contained inside a GST-inclusive amount.
 * inclusive = base + gst  =>  gst = inclusive - inclusive / (1 + rate)
 */
export const calcIncludedGst = (
  inclusiveAmount: number | string,
  gstPercent: number | string,
): number => {
  const amount = num(inclusiveAmount);
  const rate = num(gstPercent);
  if (rate <= 0) return 0;
  return round2(amount - amount / (1 + rate / 100));
};

/** Taxable (pre-GST) value contained inside a GST-inclusive amount */
export const calcTaxableValue = (
  inclusiveAmount: number | string,
  gstPercent: number | string,
): number => round2(num(inclusiveAmount) - calcIncludedGst(inclusiveAmount, gstPercent));

export type AppliedOffer = {
  /** The offer the bill qualifies for, or null when it reaches none */
  offer: { min_amount: number; percent: number } | null;
  discount: number;
  /** The next bigger offer and how much more the bill needs to reach it */
  next: { min_amount: number; percent: number; short_by: number } | null;
};

/**
 * Bill-amount offer, applied automatically: "bill of ₹600 or more → 5% off".
 * The bill qualifies once its amount (after per-line discounts) reaches the
 * minimum; when several qualify, the biggest % wins.
 */
export const calcBillOffer = (
  offers: { min_amount: number; percent: number }[],
  billAmount: number,
): AppliedOffer => {
  const amount = num(billAmount);
  let offer: AppliedOffer["offer"] = null;
  let next: AppliedOffer["next"] = null;
  for (const o of offers) {
    if (o.min_amount <= 0 || o.percent <= 0) continue;
    if (amount >= o.min_amount) {
      if (!offer || o.percent > offer.percent) offer = o;
    } else if (!next || o.min_amount < next.min_amount) {
      next = { ...o, short_by: round2(o.min_amount - amount) };
    }
  }
  if (next && offer && next.percent <= offer.percent) next = null;
  return {
    offer,
    discount: offer && amount > 0 ? round2((amount * Math.min(100, offer.percent)) / 100) : 0,
    next: amount > 0 ? next : null,
  };
};

export type BillTotals = {
  subTotal: number;
  discount: number;
  taxableAmount: number;
  gstAmount: number;
  gstPercent: number;
  grandTotal: number;
  itemCount: number;
  totalQty: number;
};

/**
 * Bill summary.
 *   Sub Total      = sum(MRP per unit x qty)
 *   Discount       = sum((MRP - selling) per unit x qty)   <- auto calculated
 *   Grand Total    = sum(selling per unit x qty)           <- what is payable
 *   GST            = the tax already inside the grand total
 *   Taxable Amount = grand total - GST
 */
export const calcBillTotals = (
  lines: { qty: number; mrp_per_unit: number; per_unit_price: number; gst_percent: number }[],
): BillTotals => {
  let subTotal = 0;
  let grandTotal = 0;
  let gstAmount = 0;
  let totalQty = 0;

  for (const line of lines) {
    const qty = num(line.qty);
    const lineMrp = num(line.mrp_per_unit) * qty;
    const lineAmount = num(line.per_unit_price) * qty;
    subTotal += lineMrp;
    grandTotal += lineAmount;
    gstAmount += calcIncludedGst(lineAmount, line.gst_percent);
    totalQty += qty;
  }

  subTotal = round2(subTotal);
  grandTotal = round2(grandTotal);
  gstAmount = round2(gstAmount);

  const taxableAmount = round2(grandTotal - gstAmount);
  const gstPercent = taxableAmount > 0 ? round2((gstAmount / taxableAmount) * 100) : 0;

  return {
    subTotal,
    discount: round2(subTotal - grandTotal),
    taxableAmount,
    gstAmount,
    gstPercent,
    grandTotal,
    itemCount: lines.length,
    totalQty,
  };
};
