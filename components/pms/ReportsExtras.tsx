"use client";

import React from "react";
import type { BatchRow, Bill, Customer, LedgerData, Supplier } from "@/lib/types";
import type { Sheet } from "@/lib/xlsx";
import { amount, dateSlash, todayIso } from "@/lib/format";
import { calcIncludedGst, round2 } from "@/lib/calc";
import { Card } from "./ui";

/* ==========================================================================
   Analytical reports for one dashboard. Each report is a plain table built
   from data the shell already holds, so it renders and exports the same way.
   ========================================================================== */

export type ReportKind =
  | "BILLS"
  | "PRODUCTS"
  | "CUSTOMERS"
  | "PROFIT"
  | "TAX"
  | "PURCHASES"
  | "STOCK"
  | "RECEIVABLES"
  | "RETURNS";

export const REPORT_OPTIONS: { key: ReportKind; label: string }[] = [
  { key: "BILLS", label: "Sales — bill list" },
  { key: "PRODUCTS", label: "Product-wise sales" },
  { key: "CUSTOMERS", label: "Customer-wise sales" },
  { key: "PROFIT", label: "Profit margin" },
  { key: "TAX", label: "GST / tax summary" },
  { key: "PURCHASES", label: "Purchase summary" },
  { key: "STOCK", label: "Stock valuation" },
  { key: "RECEIVABLES", label: "Receivables & overdue" },
  { key: "RETURNS", label: "Returns" },
];

type Cell = string | number;
type Column = { header: string; width: number; numeric?: boolean };
export type ReportTableData = { title: string; columns: Column[]; rows: Cell[][]; note?: string };

type Ctx = {
  bills: Bill[];
  batchRows: BatchRow[];
  customers: Customer[];
  suppliers: Supplier[];
  ledger?: LedgerData;
  start: string;
  end: string;
};

/** Cost per unit sold; older bills (before cost was captured) fall back to the batch's purchase rate. */
const costOf = (batchRows: BatchRow[]) => {
  const byBatch = new Map(batchRows.map((r) => [r.batch.id, r.batch]));
  return (item: Bill["items"][number]) => {
    if (item.cost_per_unit > 0) return item.cost_per_unit;
    const b = byBatch.get(item.batch_id);
    return b ? round2(b.purchase_rate / (b.pack_size || 1)) : 0;
  };
};

/** Bill-level discount spread across lines so line totals add up to the bill. */
const factorOf = (bill: Bill) => {
  const lines = bill.items.reduce((s, i) => s + i.line_amount, 0);
  return lines > 0 ? bill.grand_total / lines : 1;
};

const inRange = (date: string, start: string, end: string) => date >= start && date <= end;

export const buildReport = (kind: ReportKind, ctx: Ctx): ReportTableData | null => {
  const { bills, batchRows, customers, suppliers, ledger, start, end } = ctx;
  const cost = costOf(batchRows);

  switch (kind) {
    case "PRODUCTS": {
      const map = new Map<string, { name: string; qty: number; returned: number; sales: number; cost: number; bills: Set<string> }>();
      for (const bill of bills) {
        const f = factorOf(bill);
        for (const i of bill.items) {
          const cur = map.get(i.medicine_id) || { name: i.generic_name, qty: 0, returned: 0, sales: 0, cost: 0, bills: new Set<string>() };
          const net = i.qty - i.returned_qty;
          cur.qty += i.qty;
          cur.returned += i.returned_qty;
          cur.sales += i.per_unit_price * net * f;
          cur.cost += cost(i) * net;
          cur.bills.add(bill.id);
          map.set(i.medicine_id, cur);
        }
      }
      const rows = [...map.values()]
        .sort((a, b) => b.sales - a.sales)
        .map((r, n) => [n + 1, r.name, r.bills.size, r.qty, r.returned, round2(r.sales), round2(r.cost), round2(r.sales - r.cost)]);
      return {
        title: "Product-wise sales",
        columns: [
          { header: "Sno", width: 6 },
          { header: "Medicine", width: 28 },
          { header: "Bills", width: 8, numeric: true },
          { header: "Units sold", width: 11, numeric: true },
          { header: "Units returned", width: 13, numeric: true },
          { header: "Net sales (₹)", width: 14, numeric: true },
          { header: "Cost (₹)", width: 12, numeric: true },
          { header: "Gross profit (₹)", width: 15, numeric: true },
        ],
        rows,
      };
    }

    case "CUSTOMERS": {
      const map = new Map<string, { name: string; id: string; bills: number; sales: number; paid: number; due: number; returned: number }>();
      for (const bill of bills) {
        const key = bill.customer_id || `walkin:${bill.customer_phone || "-"}`;
        const cur = map.get(key) || {
          name: bill.customer_name || "Walk-in Customer",
          id: bill.customer_id || "",
          bills: 0,
          sales: 0,
          paid: 0,
          due: 0,
          returned: 0,
        };
        cur.bills += 1;
        cur.sales += bill.grand_total;
        cur.paid += bill.paid_amount;
        cur.due += bill.due_amount;
        cur.returned += bill.returned_amount;
        map.set(key, cur);
      }
      const rows = [...map.values()]
        .sort((a, b) => b.sales - a.sales)
        .map((r, n) => [n + 1, r.id || "—", r.name, r.bills, round2(r.sales), round2(r.returned), round2(r.paid), round2(r.due)]);
      return {
        title: "Customer-wise sales",
        columns: [
          { header: "Sno", width: 6 },
          { header: "Customer ID", width: 13 },
          { header: "Customer", width: 26 },
          { header: "Bills", width: 8, numeric: true },
          { header: "Sales (₹)", width: 13, numeric: true },
          { header: "Returns (₹)", width: 12, numeric: true },
          { header: "Paid (₹)", width: 12, numeric: true },
          { header: "Outstanding (₹)", width: 15, numeric: true },
        ],
        rows,
      };
    }

    case "PROFIT": {
      let sales = 0;
      let costTotal = 0;
      const rows = bills.map((bill, n) => {
        const f = factorOf(bill);
        let s = 0;
        let c = 0;
        for (const i of bill.items) {
          const net = i.qty - i.returned_qty;
          s += i.per_unit_price * net * f;
          c += cost(i) * net;
        }
        sales += s;
        costTotal += c;
        return [n + 1, dateSlash(bill.bill_date), bill.id, bill.customer_name || "Walk-in", round2(s), round2(c), round2(s - c), s > 0 ? round2(((s - c) / s) * 100) : 0];
      });
      return {
        title: "Profit margin",
        columns: [
          { header: "Sno", width: 6 },
          { header: "Date", width: 11 },
          { header: "Bill no", width: 10 },
          { header: "Customer", width: 22 },
          { header: "Net sales (₹)", width: 13, numeric: true },
          { header: "Cost (₹)", width: 12, numeric: true },
          { header: "Gross profit (₹)", width: 15, numeric: true },
          { header: "Margin %", width: 10, numeric: true },
        ],
        rows,
        note: `Total: sales ₹${amount(sales)} · cost ₹${amount(costTotal)} · profit ₹${amount(sales - costTotal)} (${
          sales > 0 ? (((sales - costTotal) / sales) * 100).toFixed(1) : "0.0"
        }%). Cost is the purchase rate per unit of the batch sold; GST-inclusive on both sides.`,
      };
    }

    case "TAX": {
      const slabs = new Map<number, { sales: number; gst: number }>();
      for (const bill of bills) {
        const f = factorOf(bill);
        for (const i of bill.items) {
          const slab = Math.round(i.gst_percent);
          const value = i.per_unit_price * (i.qty - i.returned_qty) * f;
          const cur = slabs.get(slab) || { sales: 0, gst: 0 };
          cur.sales += value;
          cur.gst += calcIncludedGst(value, slab);
          slabs.set(slab, cur);
        }
      }
      const rows = [...slabs.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([slab, v]) => [`GST ${slab}%`, round2(v.sales - v.gst), round2(v.gst / 2), round2(v.gst / 2), round2(v.gst), round2(v.sales)]);
      return {
        title: "GST / tax summary",
        columns: [
          { header: "Slab", width: 10 },
          { header: "Taxable value (₹)", width: 16, numeric: true },
          { header: "CGST (₹)", width: 12, numeric: true },
          { header: "SGST (₹)", width: 12, numeric: true },
          { header: "Total GST (₹)", width: 13, numeric: true },
          { header: "Sales incl. GST (₹)", width: 17, numeric: true },
        ],
        rows,
        note: "Net of returns. GST is included in the selling price, so it is extracted rather than added.",
      };
    }

    case "PURCHASES": {
      const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
      const map = new Map<string, { date: string; supplier: string; invoice: string; lines: number; packs: number; value: number; gst: number }>();
      for (const { batch } of batchRows) {
        if (!inRange(batch.purchase_date, start, end)) continue;
        const key = `${batch.supplier_id}|${batch.invoice_no}|${batch.purchase_date}`;
        const cur = map.get(key) || {
          date: batch.purchase_date,
          supplier: (batch.supplier_id && supplierName.get(batch.supplier_id)) || "—",
          invoice: batch.invoice_no || "—",
          lines: 0,
          packs: 0,
          value: 0,
          gst: 0,
        };
        const value = batch.purchase_rate * batch.qty_packs;
        cur.lines += 1;
        cur.packs += batch.qty_packs;
        cur.value += value;
        cur.gst += calcIncludedGst(value, batch.gst_percent);
        map.set(key, cur);
      }
      const rows = [...map.values()]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((r, n) => [n + 1, dateSlash(r.date), r.supplier, r.invoice, r.lines, r.packs, round2(r.value), round2(r.gst)]);
      return {
        title: "Purchase summary",
        columns: [
          { header: "Sno", width: 6 },
          { header: "Date", width: 11 },
          { header: "Supplier", width: 24 },
          { header: "Invoice no", width: 14 },
          { header: "Lines", width: 8, numeric: true },
          { header: "Packs", width: 9, numeric: true },
          { header: "Value at cost (₹)", width: 15, numeric: true },
          { header: "GST inside (₹)", width: 13, numeric: true },
        ],
        rows,
      };
    }

    case "STOCK": {
      const map = new Map<string, { name: string; batches: number; units: number; cost: number; selling: number; mrp: number }>();
      for (const { batch, medicine } of batchRows) {
        if (batch.stock_qty <= 0) continue;
        const packs = batch.stock_qty / (batch.pack_size || 1);
        const cur = map.get(medicine.id) || { name: medicine.generic_name, batches: 0, units: 0, cost: 0, selling: 0, mrp: 0 };
        cur.batches += 1;
        cur.units += batch.stock_qty;
        cur.cost += packs * batch.purchase_rate;
        cur.selling += packs * batch.selling_price;
        cur.mrp += packs * batch.mrp;
        map.set(medicine.id, cur);
      }
      const list = [...map.values()].sort((a, b) => b.cost - a.cost);
      const totalCost = list.reduce((s, r) => s + r.cost, 0);
      return {
        title: "Stock valuation",
        columns: [
          { header: "Sno", width: 6 },
          { header: "Medicine", width: 28 },
          { header: "Batches", width: 9, numeric: true },
          { header: "Units", width: 9, numeric: true },
          { header: "At cost (₹)", width: 13, numeric: true },
          { header: "At selling price (₹)", width: 17, numeric: true },
          { header: "At MRP (₹)", width: 13, numeric: true },
        ],
        rows: list.map((r, n) => [n + 1, r.name, r.batches, r.units, round2(r.cost), round2(r.selling), round2(r.mrp)]),
        note: `Current stock (not limited to the period). Total at cost ₹${amount(totalCost)}.`,
      };
    }

    case "RECEIVABLES": {
      const today = todayIso();
      const map = new Map<string, { id: string; name: string; phone: string; bills: number; due: number; overdue: number; oldest: string }>();
      for (const bill of bills) {
        if (bill.due_amount <= 0) continue;
        const key = bill.customer_id || bill.id;
        const cust = customers.find((c) => c.id === bill.customer_id);
        const cur = map.get(key) || {
          id: bill.customer_id || "",
          name: cust?.name || bill.customer_name,
          phone: cust?.phone || bill.customer_phone,
          bills: 0,
          due: 0,
          overdue: 0,
          oldest: bill.due_date || bill.bill_date,
        };
        cur.bills += 1;
        cur.due += bill.due_amount;
        if (bill.due_date && bill.due_date < today) cur.overdue += bill.due_amount;
        const when = bill.due_date || bill.bill_date;
        if (when < cur.oldest) cur.oldest = when;
        map.set(key, cur);
      }
      return {
        title: "Receivables & overdue",
        columns: [
          { header: "Sno", width: 6 },
          { header: "Customer ID", width: 13 },
          { header: "Customer", width: 26 },
          { header: "Phone", width: 13 },
          { header: "Open bills", width: 10, numeric: true },
          { header: "Outstanding (₹)", width: 15, numeric: true },
          { header: "Overdue (₹)", width: 13, numeric: true },
          { header: "Oldest due", width: 12 },
        ],
        rows: [...map.values()]
          .sort((a, b) => b.overdue - a.overdue || b.due - a.due)
          .map((r, n) => [n + 1, r.id || "—", r.name || "—", r.phone || "—", r.bills, round2(r.due), round2(r.overdue), dateSlash(r.oldest)]),
        note: "All open balances, whatever the period selected.",
      };
    }

    case "RETURNS": {
      const sales = (ledger?.salesReturns ?? [])
        .filter((r) => inRange(r.created_at.slice(0, 10), start, end))
        .map((r) => [dateSlash(r.created_at.slice(0, 10)), "Sales return", r.bill_id, r.items.map((i) => `${i.generic_name} × ${i.qty}`).join(", "), round2(r.amount), r.reason || ""]);
      const purchases = (ledger?.purchaseReturns ?? [])
        .filter((r) => inRange(r.created_at.slice(0, 10), start, end))
        .map((r) => [
          dateSlash(r.created_at.slice(0, 10)),
          "Purchase return",
          suppliers.find((s) => s.id === r.supplier_id)?.name || "—",
          `${r.generic_name} (${r.batch_no}) × ${r.qty}`,
          round2(r.amount),
          r.reason || "",
        ]);
      return {
        title: "Returns",
        columns: [
          { header: "Date", width: 11 },
          { header: "Type", width: 15 },
          { header: "Bill / supplier", width: 22 },
          { header: "Items", width: 40 },
          { header: "Value (₹)", width: 12, numeric: true },
          { header: "Reason", width: 22 },
        ],
        rows: [...sales, ...purchases],
      };
    }

    default:
      return null;
  }
};

export const reportSheet = (report: ReportTableData): Sheet => ({
  name: report.title.slice(0, 31).replace(/[\\/?*[\]:]/g, "-"),
  columns: report.columns.map((c) => ({ header: c.header, width: c.width })),
  rows: report.rows,
});

export const ReportTable = ({ report }: { report: ReportTableData }) => (
  <Card className="overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px]">
        <thead>
          <tr className="bg-[#f4f6f8] text-gray-700">
            {report.columns.map((c) => (
              <th key={c.header} className={`th ${c.numeric ? "text-right" : ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1f3f5]">
          {report.rows.map((row, r) => (
            <tr key={r} className="transition hover:bg-[#fafbfc]">
              {row.map((cell, c) => (
                <td key={c} className={`td ${report.columns[c]?.numeric ? "text-right" : ""}`}>
                  {typeof cell === "number" && report.columns[c]?.header.includes("₹") ? amount(cell) : cell}
                </td>
              ))}
            </tr>
          ))}
          {!report.rows.length && (
            <tr>
              <td colSpan={report.columns.length} className="px-4 py-16 text-center text-[13.5px] text-gray-400">
                Nothing to report for this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    {report.note && <p className="border-t border-[#eef1f3] px-4 py-3 text-[12px] text-gray-500">{report.note}</p>}
  </Card>
);
