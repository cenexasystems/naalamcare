"use client";

import React, { useMemo, useState } from "react";
import {
  Search,
  Download,
  Plus,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Boxes,
  ArrowDownCircle,
  CalendarClock,
  CalendarX2,
  Package,
  Pencil,
  Trash2,
  AlertTriangle,
  X,
  History,
  PackageMinus,
} from "lucide-react";
import type { Batch, BatchRow, DrugSchedule, Medicine, MedicineWithBatches, PurchaseUnitType, StockMovement } from "@/lib/types";
import { amount, dateSlash, expiryState, monthSlash, scheduleLabel, timeLabel, unitNoun } from "@/lib/format";
import { adjustStock, deleteBatch, deleteMedicine, getBatchMovements, saveBatch, saveMedicine } from "@/lib/actions";
import { act, useMode } from "./mode-context";
import { useReconciliation } from "./data";
import { INVENTORY_SHEET } from "./exports";
import { downloadCsv, downloadExcel } from "@/lib/xlsx";
import { useSettings } from "./data";
import { playAlarmBeep } from "@/lib/alarm";
import { Button, Card, Field, Modal, PageTitle, Pill, Select, StatTile, TextInput } from "./ui";

const PAGE_SIZE = 8;
const SCHEDULES: DrugSchedule[] = ["H", "H1", "X", "NRX", "OTC", "General"];
const PURCHASE_UNITS: PurchaseUnitType[] = ["Strip", "Piece", "Bottle"];

export const Inventory = ({
  medicines,
  rows,
  onChanged,
  onAddStock,
  onViewExpiry,
  role,
}: {
  medicines: MedicineWithBatches[];
  rows: BatchRow[];
  onChanged: (message?: string) => void;
  onAddStock: () => void;
  onViewExpiry: (tab: "expired" | "soon") => void;
  role: "admin" | "staff";
}) => {
  const [tab, setTab] = useState<"stock" | "master">("stock");
  const [search, setSearch] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState("ALL");
  const [expiryFilter, setExpiryFilter] = useState("ALL");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [boxFilter, setBoxFilter] = useState("");
  const [page, setPage] = useState(1);
  const [editBatch, setEditBatch] = useState<Batch | null>(null);
  const [editMedicine, setEditMedicine] = useState<Medicine | null>(null);
  const [adjusting, setAdjusting] = useState<BatchRow | null>(null);
  const [historyOf, setHistoryOf] = useState<BatchRow | null>(null);
  const mode = useMode();
  const { data: reconciliation } = useReconciliation(role === "admin");
  const legacyBatches = reconciliation?.batches.length ?? 0;
  const { data: settings } = useSettings();
  const alertMonths = settings?.expiry_alert_months ?? 6;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(({ batch, medicine }) => {
      if (
        q &&
        !(
          medicine.generic_name.toLowerCase().includes(q) ||
          batch.brand_name.toLowerCase().includes(q) ||
          batch.manufacturer.toLowerCase().includes(q) ||
          batch.batch_no.toLowerCase().includes(q) ||
          medicine.hsn_code.includes(q) ||
          batch.box.toLowerCase().includes(q)
        )
      )
        return false;

      if (scheduleFilter === "OTC" && medicine.schedule !== "OTC") return false;
      if (scheduleFilter === "SCHEDULED" && medicine.schedule === "OTC") return false;
      if (SCHEDULES.includes(scheduleFilter as DrugSchedule) && medicine.schedule !== scheduleFilter)
        return false;

      const state = expiryState(batch.exp_date);
      if (expiryFilter === "EXPIRED" && state !== "EXPIRED") return false;
      if (expiryFilter === "SOON" && state !== "SOON") return false;
      if (expiryFilter === "OK" && state !== "OK") return false;

      if (stockFilter === "LOW" && batch.stock_qty > medicine.low_stock_threshold) return false;
      if (stockFilter === "OUT" && batch.stock_qty > 0) return false;
      if (stockFilter === "IN" && batch.stock_qty <= 0) return false;

      if (boxFilter.trim() && !batch.box.toLowerCase().includes(boxFilter.trim().toLowerCase()))
        return false;

      return true;
    });
  }, [rows, search, scheduleFilter, expiryFilter, stockFilter, boxFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  /* ------------------------------ summary -------------------------------- */
  const summary = useMemo(() => {
    let low = 0;
    let out = 0;
    let soon = 0;
    let expired = 0;
    let qty = 0;
    for (const { batch, medicine } of rows) {
      qty += batch.stock_qty;
      if (batch.stock_qty <= 0) out += 1;
      else if (batch.stock_qty <= medicine.low_stock_threshold) low += 1;
      const state = expiryState(batch.exp_date, alertMonths);
      if (state === "EXPIRED") expired += 1;
      else if (state === "SOON") soon += 1;
    }
    return { total: rows.length, low, out, soon, expired, qty };
  }, [rows, alertMonths]);

  // Show the stock/expiry alert once per open of the Stock tab. Dismissing it
  // hides it until the screen is reopened.
  const [alertDismissed, setAlertDismissed] = useState(false);
  const showStockAlert =
    tab === "stock" &&
    !alertDismissed &&
    (summary.low > 0 || summary.out > 0 || summary.expired > 0 || summary.soon > 0);


  const handleExport = (format: "xlsx" | "csv") => {
    const sheet = INVENTORY_SHEET(rows);
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") downloadCsv(sheet, `inventory-${stamp}.csv`);
    else downloadExcel([sheet], `inventory-${stamp}.xlsx`);
  };

  return (
    <div>
      <PageTitle
        title={mode === "wholesale" ? "Wholesale Inventory" : "Inventory"}
        subtitle={`Manage your ${mode} medicine stock`}
        right={
          <>
            <div className="flex overflow-hidden rounded-lg border border-[#d8dde3]">
              <button
                onClick={() => setTab("stock")}
                className={`cursor-pointer px-4 py-2 text-[13px] font-semibold transition ${
                  tab === "stock" ? "bg-[var(--c-deep)] text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                Stock
              </button>
              <button
                onClick={() => setTab("master")}
                className={`cursor-pointer px-4 py-2 text-[13px] font-semibold transition ${
                  tab === "master" ? "bg-[var(--c-deep)] text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                Medicine Master
              </button>
            </div>
            <Button variant="ghost" onClick={() => handleExport("xlsx")}>
              <Download className="h-4 w-4" /> Export
            </Button>
            {role === "admin" && tab === "master" && (
              <Button variant="ghost" onClick={() => setEditMedicine(NEW_MEDICINE)}>
                <Plus className="h-4 w-4" /> Add Medicine
              </Button>
            )}
            {role === "admin" && (
              <Button variant="blue" onClick={onAddStock}>
                <Plus className="h-4 w-4" /> Add Stock
              </Button>
            )}
          </>
        }
      />

      {legacyBatches > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          <AlertTriangle className="mt-[1px] h-4 w-4 shrink-0" />
          <span>
            {legacyBatches} batch{legacyBatches === 1 ? "" : "es"} from before the retail / wholesale split{" "}
            {legacyBatches === 1 ? "is" : "are"} not assigned to either inventory yet. Assign them in{" "}
            <b>Settings → Reconciliation</b>; until then they can&rsquo;t be billed.
          </span>
        </div>
      )}

      {tab === "master" ? (
        <MedicineMaster
          mode={mode}
          medicines={medicines}
          onEdit={setEditMedicine}
          onChanged={onChanged}
          role={role}
        />
      ) : (
        <>
          {/* Low / out-of-stock alarm modal — pops up (with a repeating beep) when
              the Stock tab opens and something needs restocking. */}
          {showStockAlert && (
            <StockAlarmModal
              low={summary.low}
              out={summary.out}
              expired={summary.expired}
              soon={summary.soon}
              onClose={() => setAlertDismissed(true)}
              onViewLow={() => {
                setStockFilter("LOW");
                setExpiryFilter("ALL");
                setPage(1);
                setAlertDismissed(true);
              }}
              onViewOut={() => {
                setStockFilter("OUT");
                setExpiryFilter("ALL");
                setPage(1);
                setAlertDismissed(true);
              }}
              onViewExpired={() => {
                setAlertDismissed(true);
                onViewExpiry("expired");
              }}
              onViewSoon={() => {
                setAlertDismissed(true);
                onViewExpiry("soon");
              }}
            />
          )}

          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative w-full min-w-[220px] sm:w-[300px]">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by Generic / Brand / Batch / Box..."
                className="h-11 w-full rounded-lg border border-[#e2e6ea] bg-white pl-10 pr-3 text-[13.5px] outline-none transition placeholder:text-gray-400 focus:border-[var(--c-primary)]"
              />
            </div>
            <div className="w-[190px]">
            <Select
              value={scheduleFilter}
              onChange={(e) => {
                setScheduleFilter(e.target.value);
                setPage(1);
              }}
              className="h-11 py-0"
            >
              <option value="ALL">Scheduled / OTC: All</option>
              <option value="OTC">OTC only</option>
              <option value="SCHEDULED">Scheduled only</option>
              {SCHEDULES.filter((s) => s !== "OTC").map((s) => (
                <option key={s} value={s}>
                  Schedule {s}
                </option>
              ))}
            </Select>
            </div>
            <div className="w-[150px]">
            <Select
              value={expiryFilter}
              onChange={(e) => {
                setExpiryFilter(e.target.value);
                setPage(1);
              }}
              className="h-11 py-0"
            >
              <option value="ALL">Expiry: All</option>
              <option value="EXPIRED">Expired</option>
              <option value="SOON">Expiring soon</option>
              <option value="OK">Valid</option>
            </Select>
            </div>
            <div className="w-[175px]">
            <Select
              value={stockFilter}
              onChange={(e) => {
                setStockFilter(e.target.value);
                setPage(1);
              }}
              className="h-11 py-0"
            >
              <option value="ALL">Stock Status: All</option>
              <option value="IN">In stock</option>
              <option value="LOW">Low stock</option>
              <option value="OUT">Out of stock</option>
            </Select>
            </div>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-[#e2e6ea] bg-white px-4 text-[13.5px] font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <SlidersHorizontal className="h-4 w-4" /> Filters
            </button>
          </div>

          {showFilters && (
            <Card className="mb-4 flex flex-wrap items-end gap-4 p-4">
              <Field label="Box mapping" className="w-[200px]">
                <TextInput
                  value={boxFilter}
                  onChange={(e) => setBoxFilter(e.target.value)}
                  placeholder="e.g. A1"
                />
              </Field>
              <Button
                variant="ghost"
                onClick={() => {
                  setBoxFilter("");
                  setSearch("");
                  setScheduleFilter("ALL");
                  setExpiryFilter("ALL");
                  setStockFilter("ALL");
                }}
              >
                Reset all filters
              </Button>
              <Button variant="ghost" onClick={() => handleExport("csv")}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </Card>
          )}

          {/* Table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1090px]">
                <thead>
                  <tr className="bg-[#f4f6f8] text-gray-700">
                    <th className="th">S.No</th>
                    <th className="th">Generic Name</th>
                    <th className="th">Brand Name</th>
                    <th className="th">Scheduled / OTC</th>
                    <th className="th">HSN Code</th>
                    <th className="th">Box</th>
                    <th className="th">Batch No</th>
                    <th className="th">MFG DT</th>
                    <th className="th">EXP DT</th>
                    <th className="th text-right">Purchase Rate (₹)</th>
                    <th className="th text-right">MRP (₹)</th>
                    <th className="th text-right">Selling Price (₹)</th>
                    <th className="th text-right">Quantity</th>
                    {role === "admin" && <th className="th" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f5]">
                  {pageRows.map((row, index) => {
                    const { batch, medicine } = row;
                    const state = expiryState(batch.exp_date);
                    const expClass =
                      state === "EXPIRED"
                        ? "text-[#dc2626]"
                        : state === "SOON"
                          ? "text-[#d97706]"
                          : "text-[#00897b]";
                    const otc = medicine.schedule === "OTC";
                    return (
                      <tr key={batch.id} className="transition hover:bg-[#fafbfc]">
                        <td className="td text-gray-500">
                          {(currentPage - 1) * PAGE_SIZE + index + 1}
                        </td>
                        <td className="td whitespace-nowrap font-medium text-gray-900">{medicine.generic_name}</td>
                        <td className="td">{batch.brand_name || medicine.brand_name}</td>
                        <td
                          className={`td whitespace-nowrap text-[12.5px] font-semibold ${
                            otc ? "text-[#00897b]" : "text-[#dc2626]"
                          }`}
                        >
                          {scheduleLabel(medicine.schedule)}
                        </td>
                        <td className="td">{medicine.hsn_code}</td>
                        <td className="td">
                          <span className="inline-flex min-w-[30px] justify-center rounded-md bg-[#eaf1fe] px-2 py-0.5 text-[11.5px] font-bold text-[#1f6feb]">
                            {batch.box || "-"}
                          </span>
                        </td>
                        <td className="td">{batch.batch_no}</td>
                        <td className="td">{monthSlash(batch.mfg_date)}</td>
                        <td className={`td font-semibold ${expClass}`}>
                          {monthSlash(batch.exp_date)}
                        </td>
                        <td className="td text-right">{amount(batch.purchase_rate)}</td>
                        <td className="td text-right">{amount(batch.mrp)}</td>
                        <td className="td text-right">{amount(batch.selling_price)}</td>
                        <td
                          className={`td text-right font-semibold ${
                            batch.stock_qty <= 0
                              ? "text-red-600"
                              : batch.stock_qty <= medicine.low_stock_threshold
                                ? "text-amber-600"
                                : "text-gray-900"
                          }`}
                        >
                          {batch.stock_qty}
                        </td>
                        {role === "admin" && (
                          <td className="td">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setAdjusting(row)}
                                aria-label="Adjust stock"
                                title="Adjust stock (damaged / expired / correction)"
                                className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[var(--c-deep)]"
                              >
                                <PackageMinus className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setHistoryOf(row)}
                                aria-label="Stock history"
                                title="Stock movement history"
                                className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[var(--c-deep)]"
                              >
                                <History className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setEditBatch(batch)}
                                aria-label="Edit batch"
                                className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[var(--c-deep)]"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={async () => {
                                  if (confirm(`Delete batch ${batch.batch_no}?`)) {
                                    const res = await act(deleteBatch(mode, batch.id));
                                    if (res.ok) onChanged("Batch deleted.");
                                  }
                                }}
                                aria-label="Delete batch"
                                className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {!pageRows.length && (
                    <tr>
                      <td colSpan={14} className="px-4 py-16 text-center text-[13.5px] text-gray-400">
                        No stock matches these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef1f3] px-4 py-3">
              <p className="text-[12.5px] text-gray-600">
                Showing {filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0} to{" "}
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} entries
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <PageBtn disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </PageBtn>
                {pageNumbers(currentPage, totalPages).map((n, i) =>
                  n === "..." ? (
                    <span key={`gap-${i}`} className="px-1.5 text-[13px] text-gray-400">
                      …
                    </span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => setPage(n as number)}
                      className={`h-8 min-w-8 cursor-pointer rounded-md border px-2 text-[13px] font-medium transition ${
                        n === currentPage
                          ? "border-[#1f6feb] bg-white text-[#1f6feb]"
                          : "border-[#e2e6ea] bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {n}
                    </button>
                  ),
                )}
                <PageBtn
                  disabled={currentPage === totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </PageBtn>
              </div>
            </div>
          </Card>

          {/* Legend + quick summary */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
            <Card className="p-4">
              <p className="mb-2.5 text-[13px] font-semibold text-gray-900">Scheduled / OTC Legend:</p>
              <p className="mb-1.5 flex items-center gap-2 text-[12.5px] text-gray-700">
                <span className="h-2.5 w-2.5 rounded-full bg-[#dc2626]" /> SCHEDULED - H / H1 / X / NRX
              </p>
              <p className="flex items-center gap-2 text-[12.5px] text-gray-700">
                <span className="h-2.5 w-2.5 rounded-full bg-[#00897b]" /> OTC (Over The Counter)
              </p>
            </Card>

            <div>
              <p className="mb-2.5 text-[13px] font-semibold text-gray-900">Quick Summary</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                <StatTile icon={<Package className="h-5 w-5" />} label="Total Items" value={summary.total} tone="blue" />
                <StatTile icon={<ArrowDownCircle className="h-5 w-5" />} label="Low Stock Items" value={summary.low} tone="amber" />
                <StatTile icon={<CalendarClock className="h-5 w-5" />} label="Expiring Soon" value={summary.soon} tone="amber" />
                <StatTile icon={<CalendarX2 className="h-5 w-5" />} label="Expired Items" value={summary.expired} tone="red" />
                <StatTile icon={<Boxes className="h-5 w-5" />} label="Total Stock Qty" value={summary.qty.toLocaleString("en-IN")} tone="blue" />
              </div>
            </div>
          </div>

          <p className="mt-4 text-[12px] text-gray-500">
            Note: GST is included in MRP and Selling Price.
          </p>
        </>
      )}

      <EditBatchModal
        key={editBatch?.id || "no-batch"}
        batch={editBatch}
        onClose={() => setEditBatch(null)}
        onSaved={() => {
          setEditBatch(null);
          onChanged("Batch updated.");
        }}
      />
      <EditMedicineModal
        key={editMedicine?.id || "no-medicine"}
        medicine={editMedicine}
        onClose={() => setEditMedicine(null)}
        onSaved={() => {
          const added = editMedicine?.id === NEW_MEDICINE.id;
          setEditMedicine(null);
          onChanged(added ? "Medicine added to the shared catalogue." : "Medicine updated.");
        }}
      />
      <AdjustStockModal
        key={adjusting?.batch.id || "no-adjust"}
        row={adjusting}
        onClose={() => setAdjusting(null)}
        onSaved={(message) => {
          setAdjusting(null);
          onChanged(message);
        }}
      />
      <MovementsModal key={historyOf?.batch.id || "no-history"} row={historyOf} onClose={() => setHistoryOf(null)} />
    </div>
  );
};

/* --------------------------- Medicine master tab -------------------------- */

const MedicineMaster = ({
  mode,
  medicines,
  onEdit,
  onChanged,
  role,
}: {
  mode: import("@/lib/mode").Mode;
  medicines: MedicineWithBatches[];
  onEdit: (medicine: Medicine) => void;
  onChanged: (message?: string) => void;
  role: "admin" | "staff";
}) => (
  <Card className="overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px]">
        <thead>
          <tr className="bg-[#f4f6f8] text-gray-700">
            <th className="th">S.No</th>
            <th className="th">Medicine Name</th>
            <th className="th">Generic Name</th>
            <th className="th">Manufacturer</th>
            <th className="th">Category</th>
            <th className="th">HSN</th>
            <th className="th">GST %</th>
            <th className="th">Unit</th>
            <th className="th text-right">MRP (₹)</th>
            <th className="th text-right">Purchase Price (₹)</th>
            <th className="th text-right">Selling Price (₹)</th>
            <th className="th text-right">Stock</th>
            {role === "admin" && <th className="th" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1f3f5]">
          {medicines.map((medicine, index) => {
            const b = medicine.active_batch;
            return (
              <tr key={medicine.id} className="transition hover:bg-[#fafbfc]">
                <td className="td text-gray-500">{index + 1}</td>
                <td className="td font-medium text-gray-900">{b?.brand_name || medicine.brand_name}</td>
                <td className="td">{medicine.generic_name}</td>
                <td className="td">{b?.manufacturer || medicine.manufacturer}</td>
                <td className="td">
                  <span
                    className={`text-[12.5px] font-semibold ${
                      medicine.schedule === "OTC" ? "text-[#00897b]" : "text-[#dc2626]"
                    }`}
                  >
                    {scheduleLabel(medicine.schedule)}
                  </span>
                </td>
                <td className="td">{medicine.hsn_code}</td>
                <td className="td">{medicine.gst_percent}%</td>
                <td className="td">
                  <Pill tone="gray">
                    {medicine.purchase_unit_type}
                    {b ? ` of ${b.pack_size}` : ""}
                  </Pill>
                </td>
                <td className="td text-right">{b ? amount(b.mrp) : "—"}</td>
                <td className="td text-right">{b ? amount(b.purchase_rate) : "—"}</td>
                <td className="td text-right">{b ? amount(b.selling_price) : "—"}</td>
                <td className="td text-right font-semibold">
                  {medicine.total_stock}{" "}
                  <span className="text-[11px] font-normal text-gray-500">
                    {b ? unitNoun(b.purchase_unit_type, b.pack_size) : ""}
                  </span>
                </td>
                {role === "admin" && (
                  <td className="td">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onEdit(medicine)}
                        aria-label="Edit medicine"
                        className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[var(--c-deep)]"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={async () => {
                          if (
                            confirm(
                              `Remove ${medicine.generic_name} from the shared catalogue? Medicines with stock or sales history are archived (hidden from both dashboards) rather than deleted.`,
                            )
                          ) {
                            const res = await act(deleteMedicine(mode, medicine.id));
                            if (res.ok) onChanged(res.data.archived ? "Medicine archived." : "Medicine deleted.");
                          }
                        }}
                        aria-label="Delete medicine"
                        className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
          {!medicines.length && (
            <tr>
              <td colSpan={13} className="px-4 py-16 text-center text-[13.5px] text-gray-400">
                No medicines in the master yet — add stock from the Purchase screen.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </Card>
);

/* ------------------------------ Edit modals ------------------------------ */

const EditBatchModal = ({
  batch,
  onClose,
  onSaved,
}: {
  batch: Batch | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  // Keyed by batch id at the call site, so a fresh draft comes from mounting.
  const [draft, setDraft] = useState<Batch | null>(batch);
  const mode = useMode();
  if (!draft) return null;

  const set = (patch: Partial<Batch>) => setDraft({ ...draft, ...patch });

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit Batch"
      subtitle={`Batch ${draft.batch_no}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const res = await act(
                saveBatch(mode, {
                  ...draft,
                  stock_added: draft.pack_size * draft.qty_packs,
                }),
              );
              if (res.ok) onSaved();
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Brand Name">
          <TextInput value={draft.brand_name} onChange={(e) => set({ brand_name: e.target.value })} />
        </Field>
        <Field label="Manufacturer">
          <TextInput value={draft.manufacturer} onChange={(e) => set({ manufacturer: e.target.value })} />
        </Field>
        <Field label="Batch No">
          <TextInput value={draft.batch_no} onChange={(e) => set({ batch_no: e.target.value })} />
        </Field>
        <Field label="MFG DT">
          <TextInput type="month" value={draft.mfg_date} onChange={(e) => set({ mfg_date: e.target.value })} />
        </Field>
        <Field label="EXP DT">
          <TextInput type="month" value={draft.exp_date} onChange={(e) => set({ exp_date: e.target.value })} />
        </Field>
        <Field label="Box mapping">
          <TextInput value={draft.box} onChange={(e) => set({ box: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Purchase Unit type">
          <Select
            value={draft.purchase_unit_type}
            onChange={(e) => set({ purchase_unit_type: e.target.value as PurchaseUnitType })}
          >
            {PURCHASE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Purchase Unit (units per pack)">
          <TextInput
            type="number"
            value={draft.pack_size}
            onChange={(e) => set({ pack_size: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Purchase Rate (₹)">
          <TextInput
            type="number"
            value={draft.purchase_rate}
            onChange={(e) => set({ purchase_rate: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="MRP (₹)">
          <TextInput type="number" value={draft.mrp} onChange={(e) => set({ mrp: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Selling Price (₹)">
          <TextInput
            type="number"
            value={draft.selling_price}
            onChange={(e) => set({ selling_price: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="GST %">
          <TextInput
            type="number"
            value={draft.gst_percent}
            onChange={(e) => set({ gst_percent: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Stock Quantity">
          <TextInput
            type="number"
            value={draft.stock_qty}
            onChange={(e) => set({ stock_qty: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Invoice No">
          <TextInput value={draft.invoice_no} onChange={(e) => set({ invoice_no: e.target.value })} />
        </Field>
      </div>
      <p className="mt-3 text-[12px] text-gray-500">
        Per unit price = Selling price ÷ Purchase Unit ={" "}
        <b>₹{amount(draft.pack_size ? draft.selling_price / draft.pack_size : 0)}</b> · Discount = MRP −
        Selling price = <b>₹{amount(draft.mrp - draft.selling_price)}</b>
      </p>
    </Modal>
  );
};

const EditMedicineModal = ({
  medicine,
  onClose,
  onSaved,
}: {
  medicine: Medicine | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  // Keyed by medicine id at the call site, so a fresh draft comes from mounting.
  const [draft, setDraft] = useState<Medicine | null>(medicine);
  const mode = useMode();
  const isNew = medicine?.id === NEW_MEDICINE.id;
  if (!draft) return null;

  const set = (patch: Partial<Medicine>) => setDraft({ ...draft, ...patch });

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? "Add Medicine" : "Edit Medicine"}
      subtitle="Shared catalogue — changes apply to both retail and wholesale"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const res = await act(saveMedicine(mode, { ...draft, id: isNew ? undefined : draft.id }));
              if (res.ok) onSaved();
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Generic Name">
          <TextInput value={draft.generic_name} onChange={(e) => set({ generic_name: e.target.value })} />
        </Field>
        <Field label="Salt / Composition">
          <TextInput value={draft.salt} onChange={(e) => set({ salt: e.target.value })} />
        </Field>
        <Field label="Category (Drug Schedule)">
          <Select value={draft.schedule} onChange={(e) => set({ schedule: e.target.value as DrugSchedule })}>
            {SCHEDULES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="HSN Code">
          <TextInput value={draft.hsn_code} onChange={(e) => set({ hsn_code: e.target.value })} />
        </Field>
        <Field label="GST %">
          <TextInput
            type="number"
            value={draft.gst_percent}
            onChange={(e) => set({ gst_percent: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Purchase Unit type">
          <Select
            value={draft.purchase_unit_type}
            onChange={(e) => set({ purchase_unit_type: e.target.value as PurchaseUnitType })}
          >
            {PURCHASE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Low stock threshold">
          <TextInput
            type="number"
            value={draft.low_stock_threshold}
            onChange={(e) => set({ low_stock_threshold: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Barcode (EAN / UPC)" hint="Scanning this code finds the medicine on both billing screens">
          <TextInput value={draft.barcode} onChange={(e) => set({ barcode: e.target.value.trim() })} />
        </Field>
        <Field label="Wholesale minimum order (packs)" hint="0 = no minimum">
          <TextInput
            type="number"
            value={draft.wholesale_moq}
            onChange={(e) => set({ wholesale_moq: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
      </div>
    </Modal>
  );
};

/* ---------------------------- low stock alarm ---------------------------- */

const StockAlarmModal = ({
  low,
  out,
  expired,
  soon,
  onClose,
  onViewLow,
  onViewOut,
  onViewExpired,
  onViewSoon,
}: {
  low: number;
  out: number;
  expired: number;
  soon: number;
  onClose: () => void;
  onViewLow: () => void;
  onViewOut: () => void;
  onViewExpired: () => void;
  onViewSoon: () => void;
}) => {
  // Ring a repeating alarm beep until the modal is closed. The audio engine is
  // unlocked on the first tap in the app (see lib/alarm.ts) so this works on iOS
  // Safari too, where audio can't start from a background effect.
  React.useEffect(() => {
    playAlarmBeep();
    const timer = window.setInterval(playAlarmBeep, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // A one-line summary of everything that needs attention.
  const parts: string[] = [];
  if (out > 0) parts.push(`${out} out of stock`);
  if (low > 0) parts.push(`${low} running low`);
  if (expired > 0) parts.push(`${expired} expired`);
  if (soon > 0) parts.push(`${soon} expiring soon`);
  const summaryLine = parts.join(" · ");

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-col items-center gap-3 border-b border-[#f1e6c9] bg-amber-50 px-6 py-6 text-center">
          <span className="flex h-14 w-14 animate-pulse items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-7 w-7 text-amber-600" />
          </span>
          <h3 className="text-[19px] font-bold text-amber-900">Inventory Alert</h3>
          <p className="text-[14px] font-semibold text-amber-800">{summaryLine}</p>
          <p className="text-[12.5px] text-amber-700">
            These items need attention — reorder or remove expired stock.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 px-6 py-5">
          {out > 0 && (
            <Button variant="danger" className="w-full justify-center" onClick={onViewOut}>
              View out of stock ({out})
            </Button>
          )}
          {expired > 0 && (
            <Button variant="danger" className="w-full justify-center" onClick={onViewExpired}>
              View expired ({expired})
            </Button>
          )}
          {low > 0 && (
            <button
              onClick={onViewLow}
              className="w-full cursor-pointer rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
            >
              View low stock ({low})
            </button>
          )}
          {soon > 0 && (
            <button
              onClick={onViewSoon}
              className="w-full cursor-pointer rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
            >
              View expiring soon ({soon})
            </button>
          )}
          <Button variant="ghost" className="w-full justify-center" onClick={onClose}>
            <X className="h-4 w-4" /> Close &amp; silence alarm
          </Button>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------- helpers -------------------------------- */

const PageBtn = ({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[#e2e6ea] bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
  >
    {children}
  </button>
);

const pageNumbers = (current: number, total: number): (number | string)[] => {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, "...", total];
  if (current >= total - 2) return [1, "...", total - 2, total - 1, total];
  return [1, "...", current, "...", total];
};

/* ------------------------- new medicine placeholder ----------------------- */

const NEW_MEDICINE: Medicine = {
  id: "new-medicine",
  generic_name: "",
  brand_name: "",
  manufacturer: "",
  salt: "",
  schedule: "OTC",
  hsn_code: "",
  gst_percent: 12,
  purchase_unit_type: "Strip",
  low_stock_threshold: 20,
  barcode: "",
  wholesale_moq: 0,
  archived: false,
  created_at: "",
};

/* ----------------------------- stock adjustment --------------------------- */

const ADJUST_REASONS = [
  { key: "DAMAGED", label: "Damaged — write off" },
  { key: "EXPIRED", label: "Expired — write off" },
  { key: "ADJUSTMENT", label: "Stock count correction" },
] as const;

const AdjustStockModal = ({
  row,
  onClose,
  onSaved,
}: {
  row: BatchRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) => {
  const mode = useMode();
  const [type, setType] = useState<(typeof ADJUST_REASONS)[number]["key"]>("DAMAGED");
  const [qty, setQty] = useState("");
  const [direction, setDirection] = useState<"remove" | "add">("remove");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  if (!row) return null;

  const units = Math.floor(Number(qty) || 0);
  const change = type === "ADJUSTMENT" && direction === "add" ? units : -units;
  const after = row.batch.stock_qty + change;

  return (
    <Modal
      open
      onClose={onClose}
      title="Adjust Stock"
      subtitle={`${row.medicine.generic_name} · Batch ${row.batch.batch_no} · ${row.batch.stock_qty} units in stock`}
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!units || after < 0 || saving}
            onClick={async () => {
              setSaving(true);
              const res = await act(adjustStock(mode, { batch_id: row.batch.id, type, qty_change: change, note }));
              setSaving(false);
              if (res.ok) onSaved(`Stock adjusted — ${row.medicine.generic_name} now ${res.data} units.`);
            }}
          >
            {saving ? "Saving…" : "Save adjustment"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Reason">
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            {ADJUST_REASONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          {type === "ADJUSTMENT" && (
            <Field label="Direction">
              <Select value={direction} onChange={(e) => setDirection(e.target.value as "remove" | "add")}>
                <option value="remove">Remove units</option>
                <option value="add">Add units</option>
              </Select>
            </Field>
          )}
          <Field label="Units" className={type === "ADJUSTMENT" ? "" : "col-span-2"}>
            <TextInput type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        </div>
        <Field label="Note">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>
        <p className={`text-[12.5px] ${after < 0 ? "font-semibold text-red-600" : "text-gray-600"}`}>
          Stock after adjustment: <b>{after}</b> units
        </p>
      </div>
    </Modal>
  );
};

/* --------------------------- stock movement ledger ------------------------ */

const MOVEMENT_LABEL: Record<string, string> = {
  PURCHASE: "Goods receipt",
  SALE: "Sale",
  SALE_RETURN: "Sales return",
  SALE_VOID: "Bill deleted",
  PURCHASE_RETURN: "Returned to supplier",
  ADJUSTMENT: "Correction",
  DAMAGED: "Damaged",
  EXPIRED: "Expired",
  RECLASSIFY: "Assigned to inventory",
  EDIT: "Edited",
};

const MovementsModal = ({ row, onClose }: { row: BatchRow | null; onClose: () => void }) => {
  const mode = useMode();
  const [moves, setMoves] = useState<StockMovement[] | null>(null);

  React.useEffect(() => {
    if (!row) return;
    let live = true;
    getBatchMovements(mode, row.batch.id)
      .then((res) => live && setMoves(res.ok ? res.data : []))
      .catch(() => live && setMoves([]));
    return () => {
      live = false;
    };
  }, [row, mode]);

  if (!row) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title="Stock History"
      subtitle={`${row.medicine.generic_name} · Batch ${row.batch.batch_no} · now ${row.batch.stock_qty} units`}
      width="max-w-3xl"
    >
      {moves === null ? (
        <p className="py-10 text-center text-[13px] text-gray-400">Loading…</p>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="bg-[#f4f6f8] text-gray-700">
                <th className="th">Date</th>
                <th className="th">Type</th>
                <th className="th">Reference</th>
                <th className="th text-right">Change</th>
                <th className="th text-right">Balance</th>
                <th className="th">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f3f5]">
              {moves.map((m) => (
                <tr key={m.id}>
                  <td className="td whitespace-nowrap">
                    {dateSlash(m.created_at.slice(0, 10))} {timeLabel(m.created_at)}
                  </td>
                  <td className="td">{MOVEMENT_LABEL[m.type] || m.type}</td>
                  <td className="td">{m.reference || "—"}</td>
                  <td className={`td text-right font-semibold ${m.qty_change < 0 ? "text-red-600" : "text-[var(--c-deep)]"}`}>
                    {m.qty_change > 0 ? "+" : ""}
                    {m.qty_change}
                  </td>
                  <td className="td text-right">{m.balance_after}</td>
                  <td className="td text-[12.5px] text-gray-600">{m.note || "—"}</td>
                </tr>
              ))}
              {!moves.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[13px] text-gray-400">
                    No movements recorded yet. Changes made before stock tracking was added aren&rsquo;t listed.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};
