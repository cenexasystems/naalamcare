"use client";

/* ==========================================================================
   Excel export layouts — column-for-column as specified on slide 17
   ========================================================================== */

import type { Batch, Bill, Medicine } from "@/lib/types";
import type { Sheet } from "@/lib/xlsx";
import { dateSlash, monthShort } from "@/lib/format";

export type BatchRow = { batch: Batch; medicine: Medicine; supplier_name: string };

/**
 * Inventory export
 * Sno | Genric name | brand name | Catogery | Box | HSN Code | Batch no |
 * MFG DT | EXP DT | Purchase Rate(₹) | MRP(₹) | Selling price (₹) | Quantity
 */
export const INVENTORY_SHEET = (rows: BatchRow[]): Sheet => ({
  name: "Inventory",
  columns: [
    { header: "Sno", width: 6 },
    { header: "Generic name", width: 24 },
    { header: "Brand name", width: 18 },
    { header: "Category", width: 12 },
    { header: "Box", width: 8 },
    { header: "HSN Code", width: 14 },
    { header: "Batch no", width: 16 },
    { header: "MFG DT", width: 11 },
    { header: "EXP DT", width: 11 },
    { header: "Purchase Rate (₹)", width: 16 },
    { header: "MRP (₹)", width: 11 },
    { header: "Selling price (₹)", width: 16 },
    { header: "Quantity", width: 11 },
  ],
  rows: rows.map(({ batch, medicine }, index) => [
    index + 1,
    medicine.generic_name,
    batch.brand_name || medicine.brand_name,
    medicine.schedule,
    batch.box,
    medicine.hsn_code,
    batch.batch_no,
    monthShort(batch.mfg_date),
    monthShort(batch.exp_date),
    batch.purchase_rate,
    batch.mrp,
    batch.selling_price,
    batch.stock_qty,
  ]),
});

/**
 * Sale report export
 * Sno | Sale date | Customer name | cutomer mobile no | bill no | Genric name |
 * brand name | Catogery | HSN Code | Batch no | MFG DT | EXP DT | Quantity
 */
export const SALES_SHEET = (bills: Bill[]): Sheet => {
  const rows: (string | number)[][] = [];
  let sno = 0;
  for (const bill of bills) {
    for (const item of bill.items) {
      sno += 1;
      rows.push([
        sno,
        dateSlash(bill.bill_date),
        bill.customer_name || "Walk-in Customer",
        bill.customer_phone || "",
        bill.id,
        item.generic_name,
        item.brand_name,
        item.schedule,
        item.hsn_code,
        item.batch_no,
        monthShort(item.mfg_date),
        monthShort(item.exp_date),
        item.qty,
      ]);
    }
  }

  return {
    name: "Sale Report",
    columns: [
      { header: "Sno", width: 6 },
      { header: "Sale date", width: 13 },
      { header: "Customer name", width: 22 },
      { header: "Customer mobile no", width: 18 },
      { header: "Bill no", width: 12 },
      { header: "Generic name", width: 24 },
      { header: "Brand name", width: 18 },
      { header: "Category", width: 12 },
      { header: "HSN Code", width: 14 },
      { header: "Batch no", width: 16 },
      { header: "MFG DT", width: 11 },
      { header: "EXP DT", width: 11 },
      { header: "Quantity", width: 11 },
    ],
    rows,
  };
};

/** Bill-level summary sheet that accompanies the sale report */
export const BILL_SUMMARY_SHEET = (bills: Bill[]): Sheet => ({
  name: "Bill Summary",
  columns: [
    { header: "Sno", width: 6 },
    { header: "Bill no", width: 12 },
    { header: "Sale date", width: 13 },
    { header: "Customer name", width: 22 },
    { header: "Customer mobile no", width: 18 },
    { header: "Items", width: 8 },
    { header: "Sub Total (₹)", width: 14 },
    { header: "Discount (₹)", width: 13 },
    { header: "Taxable Amount (₹)", width: 18 },
    { header: "GST (₹)", width: 11 },
    { header: "Total (₹)", width: 13 },
    { header: "Payment", width: 11 },
  ],
  rows: bills.map((bill, index) => [
    index + 1,
    bill.id,
    dateSlash(bill.bill_date),
    bill.customer_name || "Walk-in Customer",
    bill.customer_phone || "",
    bill.items.length,
    bill.sub_total,
    bill.discount,
    bill.taxable_amount,
    bill.gst_amount,
    bill.grand_total,
    bill.payment_method,
  ]),
});

/** Customer list export */
export const CUSTOMERS_SHEET = (
  rows: { id: string; name: string; phone: string; address: string; doctor: string; bills: number; spend: number; last: string }[],
): Sheet => ({
  name: "Customers",
  columns: [
    { header: "Sno", width: 6 },
    { header: "Customer ID", width: 15 },
    { header: "Customer name", width: 22 },
    { header: "Mobile no", width: 15 },
    { header: "Address", width: 30 },
    { header: "Doctor name", width: 20 },
    { header: "Total bills", width: 12 },
    { header: "Total purchase (₹)", width: 18 },
    { header: "Last purchase", width: 14 },
  ],
  rows: rows.map((row, index) => [
    index + 1,
    row.id,
    row.name,
    row.phone,
    row.address,
    row.doctor,
    row.bills,
    row.spend,
    row.last ? dateSlash(row.last) : "",
  ]),
});
