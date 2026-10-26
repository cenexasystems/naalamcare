"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ShoppingCart,
  Search,
  X,
  Plus,
  Minus,
  Trash2,
  Pencil,
  Percent,
  Printer,
  PauseCircle,
  MoreHorizontal,
  CreditCard,
  PackageOpen,
  Info,
} from "lucide-react";
import type { Batch, Bill, CartLine, HeldBill, MedicineWithBatches, PaymentMethod } from "@/lib/types";
import { calcBillOffer, calcBillTotals, calcDiscountPercent, round2 } from "@/lib/calc";
import { calcTypeDiscounts } from "@/lib/type-discounts";
import { amount, money, monthShort, sellByOptions, stockBreakdown, unitNoun, todayIso, type SellBy } from "@/lib/format";
import { listHeldBills, saveHeldBills } from "@/lib/store";
import { submitBill } from "@/lib/actions";
import { Button, Card, Pill, ScheduleBadge, ScreenHeading, Select } from "./ui";
import { CustomerModal, type CustomerPayload } from "./CustomerModal";
import { act, useMode } from "./mode-context";
import { mutateAll, useBills, useSettings } from "./data";
import { ReturnModal } from "./Payments";

/** Quick-add quantities requested by the client (slide 3) */
const QUICK_ADD = [1, 10, 15, 20, 30, 45];

let lineSeq = 0;
/** Unique key for a cart row — kept out of the component so render stays pure. */
const nextLineKey = (batchId: string): string => `${batchId}-${(lineSeq += 1)}`;
const newHeldBill = (lines: CartLine[], mode: HeldBill["mode"]): HeldBill => ({
  id: `H${Date.now()}`,
  at: new Date().toISOString(),
  lines,
  mode,
});
/** One id per checkout attempt; the server returns the same bill if it arrives twice. */
const newClientRef = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ref-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** What one sellable unit is called for a given purchase unit type */
const saleNoun = (unitType: string): string =>
  unitType === "Bottle" ? "Bottle" : unitType === "Piece" ? "Piece" : "Tablet";

export const Billing = ({
  medicines,
  query,
  onQueryChange,
  onDone,
}: {
  medicines: MedicineWithBatches[];
  /** Owned by the shell so the top-bar search can drive it directly */
  query: string;
  onQueryChange: (value: string) => void;
  onDone: () => void;
}) => {
  /* ----------------------------- search state ---------------------------- */
  const setQuery = onQueryChange;
  const [showResults, setShowResults] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  /* --------------------------- selection state --------------------------- */
  const [selected, setSelected] = useState<MedicineWithBatches | null>(null);
  const [batchId, setBatchId] = useState<string>("");
  const [qty, setQty] = useState<number>(1);
  /** What `qty` counts: single tablets / pieces, whole strips, or whole boxes */
  const [sellBy, setSellBy] = useState<SellBy>("unit");
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  const [editingPrice, setEditingPrice] = useState(false);

  /* ------------------------------ bill state ----------------------------- */
  const [lines, setLines] = useState<CartLine[]>([]);
  const [received, setReceived] = useState<string>("");
  const [payment, setPayment] = useState<PaymentMethod>("Cash");
  const [txnRef, setTxnRef] = useState("");
  /** Counter discount on top of the automatic ones — a ₹ amount or a % of the bill */
  const [extra, setExtra] = useState<{ kind: "amount" | "percent"; value: number }>({ kind: "amount", value: 0 });
  const [showDiscountBox, setShowDiscountBox] = useState(false);
  const [discountDraft, setDiscountDraft] = useState("");
  const [discountKind, setDiscountKind] = useState<"amount" | "percent">("amount");
  const [billDate, setBillDate] = useState(todayIso());
  const [showMore, setShowMore] = useState(false);
  /** Returned goods: find the original bill by number, then the return screen opens */
  const [returnBillNo, setReturnBillNo] = useState("");
  const [returning, setReturning] = useState<Bill | null>(null);
  const { data: allBills } = useBills();
  const [customerOpen, setCustomerOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const mode = useMode();
  const { data: settings } = useSettings();
  const paymentMethods = (settings?.mode_settings.payment_methods ?? ["Cash", "UPI", "Card"]) as PaymentMethod[];
  const [submitting, setSubmitting] = useState(false);
  const clientRef = useRef<string>(newClientRef());

  /* Held bills live in this browser; each dashboard only sees its own
     (bills held before the split were made at the retail counter). */
  const allHeld = listHeldBills();
  const held = allHeld.filter((h) => (h.mode ?? "retail") === mode);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  /* ------------------------------- results ------------------------------- */
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return medicines
      .filter(
        (m) =>
          m.generic_name.toLowerCase().includes(q) ||
          m.salt.toLowerCase().includes(q) ||
          m.hsn_code.includes(q) ||
          (m.barcode && m.barcode.toLowerCase() === q) ||
          // Search through all batches for brand/manufacturer match
          m.batches.some(
            (b) =>
              b.brand_name.toLowerCase().includes(q) ||
              b.manufacturer.toLowerCase().includes(q) ||
              b.batch_no.toLowerCase().includes(q),
          ),
      )
      .slice(0, 8);
  }, [query, medicines]);

  const batch: Batch | null = useMemo(() => {
    if (!selected) return null;
    return selected.batches.find((b) => b.id === batchId) || selected.active_batch;
  }, [selected, batchId]);

  /* ------------------------- derived pricing values ---------------------- */
  const perUnitBase = batch ? round2(batch.selling_price / (batch.pack_size || 1)) : 0;
  const perUnit = priceOverride !== null ? priceOverride : perUnitBase;
  const mrpPerUnit = batch ? round2(batch.mrp / (batch.pack_size || 1)) : 0;
  const sellingPack = batch ? round2(perUnit * (batch.pack_size || 1)) : 0;
  const sellOptions = batch ? sellByOptions(batch) : [];
  const activeSellBy = sellOptions.find((o) => o.key === sellBy) ?? sellOptions[0];
  /** Tablets / pieces actually leaving stock: 2 boxes × 10 strips × 10 tablets = 200 */
  const units = qty * (activeSellBy?.units ?? 1);
  const lineAmount = round2(perUnit * units);
  const unitWord = batch ? unitNoun(batch.purchase_unit_type, batch.pack_size) : "Units";
  const stockAfter = batch ? Math.max(0, batch.stock_qty - units) : 0;
  const unitDiscount = round2(mrpPerUnit - perUnit);
  const unitDiscountPct = calcDiscountPercent(mrpPerUnit, perUnit);

  const chooseMedicine = (medicine: MedicineWithBatches) => {
    setSelected(medicine);
    setBatchId(medicine.active_batch?.id || "");
    setQty(1);
    setSellBy("unit");
    setPriceOverride(null);
    setEditingPrice(false);
    setQuery(`${medicine.generic_name}`);
    setShowResults(false);
  };

  const clearSelection = () => {
    setSelected(null);
    setBatchId("");
    setQuery("");
    setQty(1);
    setPriceOverride(null);
    searchRef.current?.focus();
  };

  /* ------------------------------- cart ops ------------------------------ */
  const addToBill = () => {
    if (!selected || !batch) return;
    if (units <= 0) return setNotice("Enter a quantity greater than zero.");
    if (units > batch.stock_qty)
      return setNotice(`Only ${batch.stock_qty} ${unitWord} (${stockBreakdown(batch)}) left in this batch.`);

    const existingIndex = lines.findIndex((l) => l.batch_id === batch.id && l.per_unit_price === perUnit);

    if (existingIndex >= 0) {
      const next = [...lines];
      const merged = next[existingIndex];
      if (merged.qty + units > batch.stock_qty) return setNotice("Not enough stock for that quantity.");
      next[existingIndex] = { ...merged, qty: merged.qty + units };
      setLines(next);
    } else {
      setLines([
        ...lines,
        {
          key: nextLineKey(batch.id),
          medicine_id: selected.id,
          batch_id: batch.id,
          generic_name: selected.generic_name,
          // Brand / manufacturer come from the batch (source of truth)
          brand_name: batch.brand_name || selected.brand_name,
          manufacturer: batch.manufacturer || selected.manufacturer,
          salt: selected.salt,
          schedule: selected.schedule,
          product_type: selected.product_type,
          hsn_code: selected.hsn_code,
          batch_no: batch.batch_no,
          mfg_date: batch.mfg_date,
          exp_date: batch.exp_date,
          box: batch.box,
          purchase_unit_type: batch.purchase_unit_type,
          pack_size: batch.pack_size,
          qty: units,
          mrp_per_unit: mrpPerUnit,
          per_unit_price: perUnit,
          selling_price_pack: sellingPack,
          mrp_pack: batch.mrp,
          gst_percent: batch.gst_percent,
          stock_available: batch.stock_qty,
        },
      ]);
    }
    clearSelection();
  };

  const removeLine = (key: string) => setLines(lines.filter((l) => l.key !== key));

  const changeLineQty = (key: string, next: number) =>
    setLines(
      lines.map((l) =>
        l.key === key ? { ...l, qty: Math.max(1, Math.min(next, l.stock_available)) } : l,
      ),
    );

  const clearBill = () => {
    setLines([]);
    setReceived("");
    setTxnRef("");
    setExtra({ kind: "amount", value: 0 });
    clientRef.current = newClientRef();
    clearSelection();
  };

  /* ------------------------------- totals -------------------------------- */
  const totals = useMemo(() => calcBillTotals(lines), [lines]);
  // Same order as the server: product-type discounts, then the bill offer, then the counter discount.
  const typeDiscount = calcTypeDiscounts(
    settings?.mode_settings.type_discounts ?? [],
    lines.map((l) => ({ product_type: l.product_type, amount: round2(l.per_unit_price * l.qty) })),
  );
  const afterType = round2(totals.grandTotal - typeDiscount.total);
  const billOffer = calcBillOffer(settings?.mode_settings.bill_offers ?? [], afterType);
  const afterOffer = round2(afterType - billOffer.discount);
  const extraDiscount = Math.min(
    afterOffer,
    extra.kind === "percent" ? round2((afterOffer * Math.min(100, extra.value)) / 100) : extra.value,
  );
  const payable = round2(Math.max(0, afterOffer - extraDiscount));
  const receivedNum = Number(received) || 0;
  const change = round2(Math.max(0, receivedNum - payable));

  const openReturn = () => {
    const no = returnBillNo.trim().toUpperCase();
    if (!no) return setNotice("Enter the bill number to return items from.");
    const bill = (allBills ?? []).find((b) => b.id.toUpperCase() === no);
    if (!bill) return setNotice(`Bill ${no} was not found in this dashboard.`);
    if (!bill.items.some((i) => i.qty - i.returned_qty > 0)) return setNotice(`Everything on bill ${bill.id} has already been returned.`);
    setShowMore(false);
    setReturning(bill);
  };

  /* -------------------------------- hold --------------------------------- */
  const holdBill = () => {
    if (!lines.length) return setNotice("Nothing to hold — the bill is empty.");
    saveHeldBills([...allHeld, newHeldBill(lines, mode)]);
    clearBill();
    setNotice("Bill held. Restore it from More Options.");
  };

  const restoreHeld = (id: string) => {
    const found = held.find((h) => h.id === id);
    if (!found) return;
    setLines(found.lines);
    saveHeldBills(allHeld.filter((h) => h.id !== id));
    setShowMore(false);
  };

  /* ------------------------------- checkout ------------------------------ */
  const startCheckout = () => {
    if (!lines.length) return setNotice("Add at least one medicine to the bill.");
    setCustomerOpen(true);
  };

  const finishBill = async (customer: CustomerPayload) => {
    if (submitting) return;
    setSubmitting(true);
    // iOS Safari blocks window.open() once it happens after an `await`, because it
    // no longer counts as being inside the tap gesture — that's why the bill saved
    // but no invoice opened on iPhone. Open the tab synchronously here (still inside
    // the tap), then redirect it to the invoice once the bill id comes back.
    const printWindow = typeof window !== "undefined" ? window.open("", "_blank") : null;
    try {
      const result = await act(submitBill(mode, {
        client_ref: clientRef.current,
        lines,
        bill_date: billDate,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_address: customer.address,
        doctor_name: customer.doctor,
        customer_email: customer.email,
        customer_age: customer.age,
        customer_gender: customer.gender,
        prescription_no: customer.prescriptionNo,
        billed_by: customer.billedBy,
        txn_ref: txnRef,
        extra_discount: extraDiscount,
        received_amount: receivedNum,
        payment_method: payment,
      }));
      if (!result.ok) {
        if (printWindow && !printWindow.closed) printWindow.close();
        return;
      }
      const billId = result.data;
      setCustomerOpen(false);
      clearBill();
      onDone();

      const url = `/invoice/${billId}?print=1`;
      if (printWindow && !printWindow.closed) {
        printWindow.location.href = url;
      } else {
        // Popup was blocked (or never opened) — fall back to the current tab so the
        // bill is never lost.
        window.location.href = url;
      }
    } catch (err) {
      // Save failed — don't leave a stray blank tab behind.
      if (printWindow && !printWindow.closed) printWindow.close();
      setNotice("Could not save the bill. Please try again.");
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  /* ----------------------------- keyboard ops ---------------------------- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F5") {
        event.preventDefault();
        addToBill();
      } else if (event.key === "F6") {
        event.preventDefault();
        holdBill();
      } else if (event.key === "F12" || event.key === "F11") {
        event.preventDefault();
        startCheckout();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ------------------------------- render -------------------------------- */
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      {/* ============================ LEFT: search + medicine ============== */}
      <section className="xl:col-span-5">
        <ScreenHeading icon={<ShoppingCart className="h-[18px] w-[18px] text-[var(--c-deep)]" />}>
          Billing ({batch ? saleNoun(batch.purchase_unit_type) : "Tablet"} Sale)
        </ScreenHeading>

        {/* Search row — one input; typing filters live, no separate button needed */}
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowResults(true);
              setHighlight(0);
            }}
            onFocus={() => setShowResults(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(0, h - 1));
              } else if (e.key === "Enter" && results[highlight]) {
                e.preventDefault();
                chooseMedicine(results[highlight]);
              } else if (e.key === "Escape") {
                setShowResults(false);
              }
            }}
            placeholder="Type medicine name, brand, salt, batch no or scan barcode"
            className="h-[46px] w-full rounded-lg border border-[#d8dde3] bg-white pl-11 pr-10 text-[15px] outline-none transition placeholder:text-gray-400 focus:border-[var(--c-primary)] focus:ring-2 focus:ring-[var(--c-primary)]/12"
          />
          {query && (
            <button
              onClick={clearSelection}
              aria-label="Clear"
              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-gray-700"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          )}

          {showResults && query.trim() && results.length > 0 && (
            <div className="absolute left-0 right-0 top-[52px] z-30 max-h-[340px] overflow-y-auto rounded-xl border border-[#e5e7eb] bg-white py-1.5 shadow-xl">
              {results.map((m, i) => {
                const b = m.active_batch;
                return (
                  <button
                    key={m.id}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => chooseMedicine(m)}
                    className={`flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left transition ${
                      i === highlight ? "bg-[var(--c-mint)]" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-gray-900">
                        {m.generic_name}
                        <span className="ml-2 text-[12px] font-medium text-gray-500">
                          {/* Show all unique brands from batches */}
                          {[...new Set(m.batches.map((b) => b.brand_name).filter(Boolean))].join(" / ")} ·{" "}
                          {[...new Set(m.batches.map((b) => b.manufacturer).filter(Boolean))].join(" / ")}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-gray-500">
                        Batch {b?.batch_no || "—"} · EXP {monthShort(b?.exp_date || "")} · Box{" "}
                        {b?.box || "—"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[13px] font-bold text-[var(--c-deep)]">
                        {m.total_stock} {b ? unitNoun(b.purchase_unit_type, b.pack_size) : ""}
                      </span>
                      <ScheduleBadge schedule={m.schedule} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {showResults && query.trim() && results.length === 0 && (
            <div className="absolute left-0 right-0 top-[52px] z-30 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 shadow-xl">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-gray-800">
                <Info className="h-4 w-4 shrink-0 text-[#d97706]" />
                No medicine found for &ldquo;{query.trim()}&rdquo;
              </p>
              <p className="mt-1 text-[11.5px] text-gray-500">
                Try a different name, brand, salt or batch number.
              </p>
            </div>
          )}
        </div>

        {/* ---------------------- selected medicine card ------------------- */}
        {selected && batch ? (
          <Card className="p-4">
            {/* Header — name, company, batch, EXP DT, category (no image) */}
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg bg-[#fafbfc] p-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-bold leading-tight">
                  <span className="text-[var(--c-deep)]">{selected.generic_name.toUpperCase()}</span>{" "}
                  <span className="text-gray-800">{batch.purchase_unit_type === "Bottle" ? "BOTTLE" : batch.purchase_unit_type === "Piece" ? "PIECE" : "TABLET"}</span>
                </p>
                <p className="mt-1.5 text-[12.5px] text-gray-600">Salt: {selected.salt}</p>
                <p className="text-[12.5px] text-gray-600">
                  Company: {batch.manufacturer || selected.manufacturer} · Brand: {batch.brand_name || selected.brand_name}
                </p>
                <p className="text-[12.5px] text-gray-600">
                  Batch: <span className="font-semibold text-gray-800">{batch.batch_no}</span> · EXP
                  DT: <span className="font-semibold text-gray-800">{monthShort(batch.exp_date)}</span>{" "}
                  · MFG DT: {monthShort(batch.mfg_date)}
                </p>
                <p className="text-[12.5px] text-gray-600">HSN: {selected.hsn_code}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-[#e3e7ea] bg-white px-2 py-1 text-[11.5px] font-semibold">
                    Category: <ScheduleBadge schedule={selected.schedule} />
                  </span>
                  <Pill tone="blue">Box {batch.box || "—"}</Pill>
                  <Pill tone="gray">GST {batch.gst_percent}%</Pill>
                </div>
              </div>

              <div className="shrink-0 text-center">
                <p className="text-[11.5px] text-gray-500">Available Stock</p>
                <p className="text-[30px] font-extrabold leading-tight text-[var(--c-deep)]">
                  {batch.stock_qty}
                </p>
                <p className="text-[13px] font-semibold text-gray-700">{unitWord}</p>
                {(batch.pack_size > 1 || batch.strips_per_box > 0) && (
                  <p className="mt-0.5 max-w-[150px] text-[11px] text-gray-500">{stockBreakdown(batch)}</p>
                )}
              </div>
            </div>

            {/* Batch picker when the medicine has more than one live batch */}
            {selected.batches.filter((b) => b.stock_qty > 0).length > 1 && (
              <div className="mt-3">
                <label className="field-label">Batch</label>
                <Select value={batch.id} onChange={(e) => setBatchId(e.target.value)}>
                  {selected.batches
                    .filter((b) => b.stock_qty > 0)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batch_no} · EXP {monthShort(b.exp_date)} · Box {b.box} · {b.stock_qty} left
                      </option>
                    ))}
                </Select>
              </div>
            )}

            {/* Quantity / Per unit price / Amount */}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
              {/* Quantity */}
              <div className="rounded-lg border border-[#e8ebee] p-3 sm:col-span-2">
                <p className="mb-2 text-[12.5px] font-medium text-gray-700">Quantity</p>
                {sellOptions.length > 1 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {sellOptions.map((o) => (
                      <button
                        key={o.key}
                        onClick={() => setSellBy(o.key)}
                        className={`cursor-pointer rounded-md border px-2.5 py-1 text-[12px] font-semibold transition ${
                          activeSellBy?.key === o.key
                            ? "border-[var(--c-primary)] bg-[var(--c-mint)] text-[var(--c-deep)]"
                            : "border-[#dfe3e7] text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center overflow-hidden rounded-lg border border-[#dfe3e7]">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="flex h-10 w-10 cursor-pointer items-center justify-center text-gray-600 transition hover:bg-gray-50"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    value={qty}
                    onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))}
                    className="h-10 w-full border-x border-[#dfe3e7] text-center text-[18px] font-bold text-gray-900 outline-none"
                  />
                  <button
                    onClick={() => setQty((q) => q + 1)}
                    className="flex h-10 w-10 cursor-pointer items-center justify-center bg-[var(--c-primary)] text-white transition hover:bg-[var(--c-hover)]"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {activeSellBy && activeSellBy.key !== "unit" && (
                  <p className="mt-1.5 text-[11.5px] font-semibold text-[var(--c-deep)]">
                    = {units} {unitWord}
                  </p>
                )}
                <p className="mb-1.5 mt-2.5 text-[11.5px] text-gray-500">Quick Add</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_ADD.map((n) => (
                    <button
                      key={n}
                      onClick={() => setQty(n)}
                      className={`min-w-[34px] cursor-pointer rounded-md border px-2 py-1 text-[12px] font-semibold transition ${
                        qty === n
                          ? "border-[var(--c-primary)] bg-[var(--c-mint)] text-[var(--c-deep)]"
                          : "border-[#dfe3e7] text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Per unit price */}
              <div className="rounded-lg border border-[#e8ebee] p-3">
                <p className="mb-2 text-[12.5px] font-medium text-gray-700">Per unit price (₹)</p>
                {editingPrice ? (
                  <input
                    type="number"
                    step="0.01"
                    autoFocus
                    value={perUnit}
                    onChange={(e) => setPriceOverride(Number(e.target.value) || 0)}
                    onBlur={() => setEditingPrice(false)}
                    onKeyDown={(e) => e.key === "Enter" && setEditingPrice(false)}
                    className="w-full rounded-md border border-[var(--c-primary)] px-2 py-1 text-[26px] font-extrabold text-[var(--c-deep)] outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[28px] font-extrabold leading-none text-[var(--c-deep)]">
                      {amount(perUnit)}
                    </span>
                    <button
                      onClick={() => setEditingPrice(true)}
                      aria-label="Edit price"
                      className="cursor-pointer text-gray-400 transition hover:text-[var(--c-deep)]"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <p className="mt-2 text-[11.5px] text-gray-500">
                  Selling price ₹{amount(sellingPack)} / {batch.purchase_unit_type}
                </p>
                {priceOverride !== null && (
                  <button
                    onClick={() => setPriceOverride(null)}
                    className="mt-1 cursor-pointer text-[11px] font-semibold text-[#1f6feb] hover:underline"
                  >
                    Reset to ₹{amount(perUnitBase)}
                  </button>
                )}
              </div>

              {/* Amount */}
              <div className="rounded-lg border border-[#e8ebee] p-3">
                <p className="mb-2 text-[12.5px] font-medium text-gray-700">Amount (₹)</p>
                <p className="text-[28px] font-extrabold leading-none text-[var(--c-deep)]">
                  {amount(lineAmount)}
                </p>
                <p className="mt-2 text-[11.5px] text-gray-500">
                  {units} × ₹{amount(perUnit)}
                </p>
              </div>
            </div>

            {/* Summary strip + add to bill */}
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg bg-[var(--c-mint)] px-4 py-3">
              <div>
                <p className="text-[11px] text-gray-500">Purchase Unit</p>
                <p className="text-[13px] font-bold text-gray-900">
                  {batch.purchase_unit_type} of {batch.pack_size}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500">Selling price (₹)</p>
                <p className="text-[13px] font-bold text-gray-900">
                  {amount(sellingPack)} / {batch.purchase_unit_type}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500">You are selling</p>
                <p className="text-[13px] font-bold text-gray-900">
                  {units} {unitWord}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500">Stock After Sale</p>
                <p className="text-[13px] font-bold text-gray-900">
                  {stockAfter} {unitWord}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500">MRP (₹) per unit</p>
                <p className="text-[13px] font-bold text-gray-900">{amount(mrpPerUnit)}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500">Discount</p>
                <p className="text-[13px] font-bold text-[var(--c-deep)]">
                  {amount(round2(unitDiscount * units))} ({unitDiscountPct.toFixed(0)}%)
                </p>
              </div>
              <button
                onClick={addToBill}
                className="ml-auto flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--c-deep)] px-5 py-3 text-[13.5px] font-bold text-white transition hover:bg-[var(--c-hover)]"
              >
                <Plus className="h-4 w-4" /> ADD TO BILL (F5)
              </button>
            </div>
          </Card>
        ) : (
          <Card className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
            <PackageOpen className="h-9 w-9 text-gray-300" />
            <p className="text-sm font-semibold text-gray-700">Search a medicine to start billing</p>
            <p className="max-w-xs text-[12.5px] text-gray-500">
              Search by medicine name, brand, salt or batch number. Press F2 from anywhere to jump to
              the search bar.
            </p>
          </Card>
        )}
      </section>

      {/* ============================ MIDDLE: current bill ================= */}
      <section className="xl:col-span-4">
        <Card className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-[#eef1f3] px-4 py-3.5">
            <h3 className="text-[14px] font-bold uppercase tracking-wide text-gray-900">
              Current Bill
            </h3>
            <p className="text-[12px] font-semibold text-gray-600">
              Bill No: <span className="text-gray-900">Auto-Generated</span>
            </p>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full min-w-[360px]">
              <thead>
                <tr className="bg-[#fafbfc] text-gray-600">
                  <th className="px-1.5 py-2.5 text-left text-[11px] font-semibold">#</th>
                  <th className="px-1.5 py-2.5 text-left text-[11px] font-semibold">Type</th>
                  <th className="px-1.5 py-2.5 text-left text-[11px] font-semibold">Product</th>
                  <th className="px-1.5 py-2.5 text-center text-[11px] font-semibold">Box</th>
                  <th className="px-1.5 py-2.5 text-center text-[11px] font-semibold">Quantity</th>
                  <th className="px-1.5 py-2.5 text-right text-[11px] font-semibold leading-tight">
                    Per unit
                    <br />
                    price
                  </th>
                  <th className="px-1.5 py-2.5 text-right text-[11px] font-semibold leading-tight">
                    Selling
                    <br />
                    price (₹)
                  </th>
                  <th className="px-1.5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f3f5]">
                {lines.map((line, index) => (
                  <tr key={line.key} className="align-middle">
                    <td className="px-1.5 py-3 text-[12px] text-gray-500">{index + 1}</td>
                    <td className="px-1.5 py-3 text-[11.5px] font-medium text-gray-700">{line.product_type || line.purchase_unit_type || "—"}</td>
                    <td className="px-1.5 py-3">
                      <p className="text-[12.5px] font-semibold leading-tight text-gray-900">
                        {line.generic_name}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {line.brand_name} · {line.qty} {unitNoun(line.purchase_unit_type, line.qty)}
                        {line.pack_size > 1 && line.qty >= line.pack_size
                          ? ` (${stockBreakdown({ ...line, strips_per_box: 0, stock_qty: line.qty })})`
                          : ""}
                      </p>
                    </td>
                    <td className="px-1.5 py-3 text-center">
                      <span className="inline-flex min-w-[26px] justify-center rounded-md bg-[#eaf1fe] px-2 py-0.5 text-[11.5px] font-bold text-[#1f6feb]">
                        {line.box || "-"}
                      </span>
                    </td>
                    <td className="px-1.5 py-3">
                      <input
                        type="number"
                        value={line.qty}
                        onChange={(e) => changeLineQty(line.key, Number(e.target.value) || 1)}
                        className="mx-auto block h-7 w-[42px] rounded-md border border-[#e3e7ea] text-center text-[12.5px] font-bold outline-none transition focus:border-[var(--c-primary)]"
                      />
                    </td>
                    <td className="px-1.5 py-3 text-right text-[12.5px] font-semibold text-gray-800">
                      {amount(line.per_unit_price)}
                    </td>
                    <td className="px-1.5 py-3 text-right text-[12.5px] font-bold text-gray-900">
                      {amount(round2(line.per_unit_price * line.qty))}
                    </td>
                    <td className="px-1.5 py-3 text-right">
                      <button
                        onClick={() => removeLine(line.key)}
                        aria-label="Remove"
                        className="cursor-pointer text-red-500 transition hover:text-red-700"
                      >
                        <Trash2 className="h-[15px] w-[15px]" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!lines.length && (
                  <tr>
                    <td colSpan={8} className="px-4 py-14 text-center text-[13px] text-gray-400">
                      No items yet — search a medicine and press ADD TO BILL (F5)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-[#eef1f3] p-3">
            <button
              onClick={clearBill}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#e3e7ea] py-2.5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <Trash2 className="h-4 w-4 text-red-500" /> Clear Bill
            </button>
            <div className="relative">
              <button
                onClick={() => {
                  setDiscountDraft(extra.value ? String(extra.value) : "");
                  setDiscountKind(extra.value ? extra.kind : "amount");
                  setShowDiscountBox((v) => !v);
                }}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#e3e7ea] py-2.5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                <Percent className="h-4 w-4 text-gray-500" /> Apply Discount
              </button>
              {showDiscountBox && (
                <div className="absolute bottom-[52px] left-0 right-0 z-30 rounded-xl border border-[#e5e7eb] bg-white p-3.5 shadow-xl sm:left-auto sm:right-0 sm:w-[260px]">
                  <p className="mb-1.5 flex items-start gap-1.5 text-[11.5px] leading-snug text-gray-500">
                    <Info className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[#1f6feb]" />
                    MRP-to-selling discount of {money(totals.discount)} is already applied
                    automatically
                    {typeDiscount.total > 0 ? `, plus ${money(typeDiscount.total)} product-type discount` : ""}
                    {billOffer.offer ? `, plus the ${billOffer.offer.percent}% bill offer (${money(billOffer.discount)})` : ""}.
                    Add an extra discount below if needed.
                  </p>
                  <div className="flex gap-2">
                    <div className="flex shrink-0 overflow-hidden rounded-lg border border-[#d8dde3] text-[13px] font-bold">
                      {(["amount", "percent"] as const).map((k) => (
                        <button
                          key={k}
                          onClick={() => setDiscountKind(k)}
                          className={`w-10 cursor-pointer transition ${
                            discountKind === k ? "bg-[var(--c-deep)] text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {k === "amount" ? "₹" : "%"}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      autoFocus
                      value={discountDraft}
                      onChange={(e) => setDiscountDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        setExtra({ kind: discountKind, value: Math.max(0, Number(discountDraft) || 0) });
                        setShowDiscountBox(false);
                      }}
                      placeholder={discountKind === "amount" ? "Extra discount ₹" : "Extra discount %"}
                      className="field"
                    />
                  </div>
                  {discountKind === "percent" && Number(discountDraft) > 0 && (
                    <p className="mt-1.5 text-[11.5px] font-semibold text-[var(--c-deep)]">
                      = {money(round2((afterOffer * Math.min(100, Number(discountDraft))) / 100))} off {money(afterOffer)}
                    </p>
                  )}
                  <div className="mt-2.5 flex gap-2">
                    <Button
                      variant="ghost"
                      className="flex-1 py-2 text-[12.5px]"
                      onClick={() => {
                        setExtra({ kind: "amount", value: 0 });
                        setShowDiscountBox(false);
                      }}
                    >
                      Remove
                    </Button>
                    <Button
                      className="flex-1 py-2 text-[12.5px]"
                      onClick={() => {
                        setExtra({ kind: discountKind, value: Math.max(0, Number(discountDraft) || 0) });
                        setShowDiscountBox(false);
                      }}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      </section>

      {/* ============================ RIGHT: bill summary ================== */}
      <section className="xl:col-span-3">
        <Card className="p-4">
          <h3 className="mb-3.5 text-[14px] font-bold uppercase tracking-wide text-[var(--c-deep)]">
            Bill Summary
          </h3>

          <div className="space-y-2.5 text-[13px]">
            <Row label={`Sub Total (${totals.itemCount} Items)`} value={money(totals.subTotal)} />
            <Row
              label="Discount (MRP to selling)"
              value={money(totals.discount)}
              tone={totals.discount > 0 ? "green" : undefined}
            />
            {typeDiscount.parts.map((p) => (
              <Row
                key={p.type}
                label={`${p.type} discount (${p.percent}% on ${money(p.subtotal)})`}
                value={`− ${money(p.discount)}`}
                tone="green"
              />
            ))}
            {billOffer.offer && (
              <Row
                label={`Bill offer (${billOffer.offer.percent}% on ₹${amount(billOffer.offer.min_amount)}+)`}
                value={`− ${money(billOffer.discount)}`}
                tone="green"
              />
            )}
            {extraDiscount > 0 && (
              <Row
                label={extra.kind === "percent" ? `Extra discount (${extra.value}%)` : "Extra discount"}
                value={`− ${money(extraDiscount)}`}
                tone="green"
              />
            )}
            <Row label="Taxable Amount" value={money(totals.taxableAmount)} />
            <Row label={`GST (${totals.gstPercent || 0}%)`} value={money(totals.gstAmount)} />
          </div>
          {billOffer.next && (
            <p className="mt-3 rounded-lg bg-[var(--c-mint)] px-3 py-2 text-[11.5px] font-medium text-[var(--c-deep)]">
              Add {money(billOffer.next.short_by)} more to get {billOffer.next.percent}% off this bill.
            </p>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-[#eef1f3] pt-4">
            <span className="text-[16px] font-bold text-gray-900">TOTAL</span>
            <span className="text-[24px] font-extrabold text-[var(--c-deep)]">{money(payable)}</span>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] text-gray-700">Received Amount (₹)</span>
              <input
                type="number"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                placeholder="0.00"
                className="h-9 w-[96px] rounded-lg border border-[#d8dde3] px-2.5 text-right text-[13px] font-semibold outline-none focus:border-[var(--c-primary)]"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] text-gray-700">Payment Method</span>
              <Select
                value={payment}
                onChange={(e) => setPayment(e.target.value as PaymentMethod)}
                className="h-9 w-[96px] py-0 text-[13px]"
              >
                {paymentMethods.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] text-gray-700">Txn Ref No.</span>
              <input
                value={txnRef}
                onChange={(e) => setTxnRef(e.target.value)}
                placeholder="UPI / Card"
                className="h-9 w-[96px] rounded-lg border border-[#d8dde3] px-2.5 text-right text-[13px] font-semibold outline-none focus:border-[var(--c-primary)]"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] text-gray-700">Change (₹)</span>
              <span className="text-[18px] font-extrabold text-[var(--c-deep)]">{money(change)}</span>
            </div>
          </div>

          <button
            onClick={startCheckout}
            className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--c-deep)] py-3.5 text-[13.5px] font-bold uppercase tracking-wide text-white transition hover:bg-[var(--c-hover)]"
          >
            <CreditCard className="h-[18px] w-[18px]" /> Pay &amp; Print (F12)
          </button>

          <div className="relative mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={holdBill}
              className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-[#e3e7ea] px-1 py-2.5 text-[11.5px] font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <PauseCircle className="h-4 w-4 text-[var(--c-deep)]" />
              <span className="leading-tight">
                Hold Bill
                <br />
                (F6)
              </span>
            </button>
            <button
              onClick={() => setShowMore((v) => !v)}
              className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-[#e3e7ea] px-1 py-2.5 text-[11.5px] font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <MoreHorizontal className="h-4 w-4 text-gray-600" />
              <span className="leading-tight">
                More
                <br />
                Options
              </span>
            </button>

            {showMore && (
              <div className="absolute bottom-[70px] left-0 right-0 z-30 rounded-xl border border-[#e5e7eb] bg-white p-3.5 shadow-xl sm:left-auto sm:right-0 sm:w-[268px]">
                <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">
                  Bill date
                </p>
                <input
                  type="date"
                  max={todayIso()}
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  className="field mb-3"
                />
                <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">
                  Return items from a bill
                </p>
                <div className="mb-3 flex gap-2">
                  <input
                    value={returnBillNo}
                    onChange={(e) => setReturnBillNo(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && openReturn()}
                    placeholder="Bill no, e.g. 12"
                    className="field"
                  />
                  <Button className="shrink-0 px-3 py-2 text-[12.5px]" onClick={openReturn}>
                    Return
                  </Button>
                </div>
                <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">
                  Held bills ({held.length})
                </p>
                {held.length ? (
                  <div className="max-h-[150px] space-y-1.5 overflow-y-auto">
                    {held.map((h) => (
                      <button
                        key={h.id}
                        onClick={() => restoreHeld(h.id)}
                        className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-[#e8ebee] px-3 py-2 text-left text-[12px] transition hover:bg-gray-50"
                      >
                        <span className="font-semibold text-gray-800">
                          {h.lines.length} item{h.lines.length === 1 ? "" : "s"}
                        </span>
                        <span className="text-gray-500">
                          {new Date(h.at).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-gray-400">No held bills.</p>
                )}
                <button
                  onClick={() => setShowMore(false)}
                  className="mt-3 w-full cursor-pointer rounded-lg border border-[#e3e7ea] py-2 text-[12.5px] font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            )}
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-gray-500">
            <Info className="mt-[1px] h-3.5 w-3.5 shrink-0 text-gray-400" />
            GST is included in the MRP and selling price. The GST % only indicates the applicable tax
            rate — nothing is added on top.
          </p>
        </Card>
      </section>

      <ReturnModal
        key={returning?.id || "no-return"}
        bill={returning}
        role="staff"
        onClose={() => setReturning(null)}
        onDone={(message) => {
          setReturning(null);
          setReturnBillNo("");
          mutateAll();
          setNotice(message);
        }}
      />

      <CustomerModal
        key={customerOpen ? "open" : "closed"}
        open={customerOpen}
        onClose={() => setCustomerOpen(false)}
        onConfirm={finishBill}
      />

      {notice && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-[var(--c-deep)] px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {notice}
        </div>
      )}
    </div>
  );
};

const Row = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green";
}) => (
  <div className="flex items-center justify-between">
    <span className="text-gray-600">{label}</span>
    <span className={`font-semibold ${tone === "green" ? "text-[var(--c-deep)]" : "text-gray-900"}`}>
      {value}
    </span>
  </div>
);
