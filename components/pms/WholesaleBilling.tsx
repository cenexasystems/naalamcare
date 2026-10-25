"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Truck,
  Search,
  X,
  Plus,
  Minus,
  Trash2,
  Printer,
  PauseCircle,
  PackageOpen,
  Info,
  Building2,
  AlertTriangle,
} from "lucide-react";
import type { Batch, Bill, CartLine, Customer, DiscountTier, HeldBill, MedicineWithBatches, PaymentMethod } from "@/lib/types";
import { calcBillOffer, calcBillTotals, round2 } from "@/lib/calc";
import { amount, money, monthShort, stockBreakdown, todayIso, unitNoun, type SellBy } from "@/lib/format";
import { listHeldBills, saveHeldBills } from "@/lib/store";
import { addPharmacyAtBilling, submitBill } from "@/lib/actions";
import { Card, Pill, ScheduleBadge, ScreenHeading, Select } from "./ui";
import { act } from "./mode-context";
import { mutateAll, useSettings } from "./data";

/* ==========================================================================
   Wholesale billing

   Same layout as the retail counter, different workflow: quantities are
   entered in packs (or loose units), prices come from the wholesale batches,
   the business customer's own discount and quantity tiers are applied, minimum
   order quantities are checked, and bills can go on credit with part payment.
   ========================================================================== */

const QUICK_PACKS = [1, 5, 10, 25, 50, 100];

let lineSeq = 0;
const nextLineKey = (batchId: string): string => `${batchId}-w${(lineSeq += 1)}`;
const newHeldBill = (lines: CartLine[]): HeldBill => ({
  id: `H${Date.now()}`,
  at: new Date().toISOString(),
  lines,
  mode: "wholesale",
});
const newClientRef = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ref-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Highest quantity tier the line qualifies for. */
const tierPercent = (tiers: DiscountTier[], packs: number): number =>
  tiers.reduce((best, t) => (packs >= t.min_packs ? Math.max(best, t.percent) : best), 0);

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const WholesaleBilling = ({
  medicines,
  customers,
  bills,
  query,
  onQueryChange,
  onDone,
}: {
  medicines: MedicineWithBatches[];
  customers: Customer[];
  bills: Bill[];
  query: string;
  onQueryChange: (value: string) => void;
  onDone: () => void;
}) => {
  const { data: settings } = useSettings();
  const ms = settings?.mode_settings;
  const tiers = useMemo(() => ms?.bulk_discount_tiers ?? [], [ms]);
  const paymentMethods = (ms?.payment_methods ?? ["Cash", "UPI", "Bank Transfer", "Cheque", "Credit"]) as PaymentMethod[];

  /* ----------------------------- search state ---------------------------- */
  const setQuery = onQueryChange;
  const [showResults, setShowResults] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  /* --------------------------- selection state --------------------------- */
  const [selected, setSelected] = useState<MedicineWithBatches | null>(null);
  const [batchId, setBatchId] = useState("");
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState<SellBy>("pack");

  /* ------------------------------ bill state ----------------------------- */
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("Credit");
  const [received, setReceived] = useState("");
  const [txnRef, setTxnRef] = useState("");
  const [billDate, setBillDate] = useState(todayIso());
  const [shipTo, setShipTo] = useState("");
  /** "+ New pharmacy" form in the billing panel; null = closed */
  const [newPharmacy, setNewPharmacy] = useState<{ name: string; phone: string; gstin: string; address: string } | null>(null);
  const [addingPharmacy, setAddingPharmacy] = useState(false);
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const clientRef = useRef(newClientRef());

  const allHeld = listHeldBills();
  const held = allHeld.filter((h) => h.mode === "wholesale");

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  const customer = customers.find((c) => c.id === customerId) || null;

  const savePharmacy = async () => {
    if (!newPharmacy || addingPharmacy) return;
    if (!newPharmacy.name.trim()) return setNotice("Enter the pharmacy name.");
    setAddingPharmacy(true);
    const res = await act(addPharmacyAtBilling(newPharmacy));
    if (res.ok) {
      // Reload the list first so the new pharmacy is there to select.
      await mutateAll();
      setCustomerId(res.data);
      setShipTo(newPharmacy.address);
      setNewPharmacy(null);
      setCustomerQuery("");
      setNotice(`Pharmacy added (${res.data}).`);
    }
    setAddingPharmacy(false);
  };
  const customerDiscount = customer?.discount_percent ?? 0;
  const outstanding = useMemo(
    () => (customer ? round2(bills.filter((b) => b.customer_id === customer.id).reduce((s, b) => s + b.due_amount, 0)) : 0),
    [customer, bills],
  );

  const customerResults = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.id.toLowerCase().includes(q) ||
          c.gstin.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [customerQuery, customers]);

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

  const packSize = batch?.pack_size || 1;
  const boxUnits = batch && batch.strips_per_box > 0 ? packSize * batch.strips_per_box : 0;
  // 2 boxes × 10 strips × 10 tablets = 200 tablets leave stock
  const units = unit === "box" && boxUnits ? qty * boxUnits : unit === "unit" ? qty : qty * packSize;
  const packs = units / packSize;
  const linePct = round2(customerDiscount + tierPercent(tiers, packs));
  const ratePack = batch ? round2(batch.selling_price * (1 - linePct / 100)) : 0;
  const lineValue = round2((ratePack / packSize) * units);
  const moq = selected?.wholesale_moq ?? 0;

  /** Price per unit for a cart line with today's customer + tier discounts. */
  const priceOf = (line: CartLine) => {
    const linePacks = line.qty / (line.pack_size || 1);
    const pct = Math.min(100, customerDiscount + tierPercent(tiers, linePacks));
    return { pct: round2(pct), perUnit: round2(round2(line.selling_price_pack * (1 - pct / 100)) / (line.pack_size || 1)) };
  };

  const chooseMedicine = (medicine: MedicineWithBatches) => {
    setSelected(medicine);
    setBatchId(medicine.active_batch?.id || "");
    setQty(Math.max(1, medicine.wholesale_moq || 1));
    setUnit("pack");
    setQuery(medicine.generic_name);
    setShowResults(false);
  };

  const clearSelection = () => {
    setSelected(null);
    setBatchId("");
    setQuery("");
    setQty(1);
    searchRef.current?.focus();
  };

  const addToBill = () => {
    if (!selected || !batch) return;
    if (units <= 0) return setNotice("Enter a quantity greater than zero.");
    const inCart = lines.filter((l) => l.batch_id === batch.id).reduce((s, l) => s + l.qty, 0);
    if (units + inCart > batch.stock_qty)
      return setNotice(`Only ${batch.stock_qty} units (${stockBreakdown(batch)}) in this batch.`);

    const existing = lines.findIndex((l) => l.batch_id === batch.id);
    if (existing >= 0) {
      const next = [...lines];
      next[existing] = { ...next[existing], qty: next[existing].qty + units };
      setLines(next);
    } else {
      setLines([
        ...lines,
        {
          key: nextLineKey(batch.id),
          medicine_id: selected.id,
          batch_id: batch.id,
          generic_name: selected.generic_name,
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
          pack_size: packSize,
          qty: units,
          mrp_per_unit: round2(batch.mrp / packSize),
          per_unit_price: round2(batch.selling_price / packSize),
          selling_price_pack: batch.selling_price,
          mrp_pack: batch.mrp,
          gst_percent: batch.gst_percent,
          stock_available: batch.stock_qty,
        },
      ]);
    }
    clearSelection();
  };

  const changeLinePacks = (key: string, nextPacks: number) =>
    setLines(
      lines.map((l) =>
        l.key === key
          ? { ...l, qty: Math.max(1, Math.min(Math.round(nextPacks * l.pack_size), l.stock_available)) }
          : l,
      ),
    );

  const removeLine = (key: string) => setLines(lines.filter((l) => l.key !== key));

  const clearBill = () => {
    setLines([]);
    setReceived("");
    setTxnRef("");
    setShipTo("");
    clientRef.current = newClientRef();
    clearSelection();
  };

  /* ------------------------------- totals -------------------------------- */
  const priced = useMemo(
    () => lines.map((l) => ({ ...l, per_unit_price: priceOf(l).perUnit })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, customerDiscount, tiers],
  );
  const totals = useMemo(() => calcBillTotals(priced), [priced]);
  const billOffer = calcBillOffer(ms?.bill_offers ?? [], totals.grandTotal);
  const payable = round2(totals.grandTotal - billOffer.discount);
  const receivedNum = Number(received) || 0;
  const isCredit = payment === "Credit";
  const dueNow = isCredit ? round2(Math.max(0, payable - receivedNum)) : 0;
  const creditDays = customer?.credit_days || ms?.default_credit_days || 0;
  const dueDate = isCredit ? addDays(billDate, creditDays) : "";
  const creditLimit = customer?.credit_limit ?? 0;
  const overLimit = isCredit && creditLimit > 0 && outstanding + dueNow > creditLimit + 0.01;

  const moqProblems = useMemo(() => {
    if (!ms?.enforce_moq) return [];
    const byMed = new Map<string, { name: string; packs: number }>();
    for (const l of lines) {
      const cur = byMed.get(l.medicine_id) || { name: l.generic_name, packs: 0 };
      cur.packs += l.qty / (l.pack_size || 1);
      byMed.set(l.medicine_id, cur);
    }
    const problems: string[] = [];
    for (const [id, v] of byMed) {
      const m = medicines.find((x) => x.id === id);
      if (m && m.wholesale_moq > 0 && v.packs < m.wholesale_moq) problems.push(`${v.name}: minimum ${m.wholesale_moq} packs`);
    }
    return problems;
  }, [lines, medicines, ms]);

  /* -------------------------------- hold --------------------------------- */
  const holdBill = () => {
    if (!lines.length) return setNotice("Nothing to hold — the bill is empty.");
    saveHeldBills([...allHeld, newHeldBill(lines)]);
    clearBill();
    setNotice("Bill held. Restore it from the held bills list.");
  };

  const restoreHeld = (id: string) => {
    const found = held.find((h) => h.id === id);
    if (!found) return;
    setLines(found.lines);
    saveHeldBills(allHeld.filter((h) => h.id !== id));
  };

  /* ------------------------------- checkout ------------------------------ */
  const checkout = async () => {
    if (submitting) return;
    if (!lines.length) return setNotice("Add at least one medicine to the bill.");
    if (!customer) return setNotice("Select the pharmacy first.");
    if (moqProblems.length) return setNotice(`Minimum order not met — ${moqProblems[0]}.`);
    if (overLimit) return setNotice("This bill would take the customer over their credit limit.");
    if (!isCredit && receivedNum > 0 && receivedNum < payable)
      return setNotice("For a part payment, choose Credit as the payment method.");

    setSubmitting(true);
    // Open the print tab inside the tap (iOS blocks window.open after an await).
    const printWindow = typeof window !== "undefined" ? window.open("", "_blank") : null;
    try {
      const result = await act(
        submitBill("wholesale", {
          client_ref: clientRef.current,
          customer_id: customer.id,
          customer_name: customer.name,
          customer_phone: customer.phone,
          customer_address: customer.address,
          doctor_name: "",
          shipping_address: shipTo || customer.shipping_address,
          txn_ref: txnRef,
          received_amount: isCredit ? receivedNum : receivedNum || payable,
          payment_method: payment,
          bill_date: billDate,
          lines: priced.map((l) => ({ batch_id: l.batch_id, qty: l.qty, per_unit_price: l.per_unit_price })),
        }),
      );
      if (!result.ok) {
        if (printWindow && !printWindow.closed) printWindow.close();
        return;
      }
      clearBill();
      onDone();
      const url = `/invoice/${encodeURIComponent(result.data)}?print=1`;
      if (printWindow && !printWindow.closed) printWindow.location.href = url;
      else window.location.href = url;
    } finally {
      setSubmitting(false);
    }
  };

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
        checkout();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ------------------------------- render -------------------------------- */
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      {/* ============================ LEFT: search + product =============== */}
      <section className="xl:col-span-5">
        <ScreenHeading icon={<Truck className="h-[18px] w-[18px] text-[var(--c-deep)]" />}>
          Wholesale Billing
        </ScreenHeading>

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
            className="h-[46px] w-full rounded-lg border border-[#d8dde3] bg-white pl-11 pr-10 text-[15px] outline-none transition placeholder:text-gray-400 focus:border-[var(--c-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--c-primary)_12%,transparent)]"
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
                          {[...new Set(m.batches.map((x) => x.brand_name).filter(Boolean))].join(" / ")}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-gray-500">
                        Batch {b?.batch_no || "—"} · EXP {monthShort(b?.exp_date || "")}
                        {m.wholesale_moq > 0 ? ` · MOQ ${m.wholesale_moq}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[13px] font-bold text-[var(--c-deep)]">
                        {b ? Math.floor(m.total_stock / (b.pack_size || 1)) : 0} {b?.purchase_unit_type || "Pack"}s
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
            </div>
          )}
        </div>

        {selected && batch ? (
          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg bg-[#fafbfc] p-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-bold leading-tight text-[var(--c-deep)]">
                  {selected.generic_name.toUpperCase()}
                </p>
                <p className="mt-1.5 text-[12.5px] text-gray-600">Salt: {selected.salt}</p>
                <p className="text-[12.5px] text-gray-600">
                  Company: {batch.manufacturer || selected.manufacturer} · Brand: {batch.brand_name || selected.brand_name}
                </p>
                <p className="text-[12.5px] text-gray-600">
                  Batch: <span className="font-semibold text-gray-800">{batch.batch_no}</span> · EXP DT:{" "}
                  <span className="font-semibold text-gray-800">{monthShort(batch.exp_date)}</span> · HSN {selected.hsn_code}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ScheduleBadge schedule={selected.schedule} />
                  <Pill tone="gray">
                    {batch.purchase_unit_type} of {packSize}
                  </Pill>
                  <Pill tone="gray">GST {batch.gst_percent}%</Pill>
                  {moq > 0 && <Pill tone="amber">MOQ {moq} packs</Pill>}
                </div>
              </div>
              <div className="shrink-0 text-center">
                <p className="text-[11.5px] text-gray-500">Available</p>
                <p className="text-[30px] font-extrabold leading-tight text-[var(--c-deep)]">
                  {Math.floor(batch.stock_qty / packSize)}
                </p>
                <p className="text-[12px] font-semibold text-gray-700">
                  {batch.purchase_unit_type}s · {batch.stock_qty} {unitNoun(batch.purchase_unit_type, packSize)}
                </p>
              </div>
            </div>

            {selected.batches.filter((b) => b.stock_qty > 0).length > 1 && (
              <div className="mt-3">
                <label className="field-label">Batch</label>
                <Select value={batch.id} onChange={(e) => setBatchId(e.target.value)}>
                  {selected.batches
                    .filter((b) => b.stock_qty > 0)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batch_no} · EXP {monthShort(b.exp_date)} · {Math.floor(b.stock_qty / (b.pack_size || 1))} packs · ₹
                        {amount(b.selling_price)}/pack
                      </option>
                    ))}
                </Select>
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-[#e8ebee] p-3 sm:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[12.5px] font-medium text-gray-700">Quantity</p>
                  <div className="flex overflow-hidden rounded-md border border-[#dfe3e7] text-[11.5px] font-semibold">
                    {(boxUnits ? (["box", "pack", "unit"] as const) : (["pack", "unit"] as const)).map((u) => (
                      <button
                        key={u}
                        onClick={() => setUnit(u)}
                        className={`cursor-pointer px-2.5 py-1 transition ${
                          unit === u ? "bg-[var(--c-deep)] text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {u === "box"
                          ? `Boxes (${batch.strips_per_box})`
                          : u === "pack"
                            ? `${batch.purchase_unit_type}s`
                            : unitNoun(batch.purchase_unit_type, packSize)}
                      </button>
                    ))}
                  </div>
                </div>
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
                    onChange={(e) => setQty(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                    className="h-10 w-full border-x border-[#dfe3e7] text-center text-[18px] font-bold text-gray-900 outline-none"
                  />
                  <button
                    onClick={() => setQty((q) => q + 1)}
                    className="flex h-10 w-10 cursor-pointer items-center justify-center bg-[var(--c-primary)] text-white transition hover:bg-[var(--c-hover)]"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {unit === "pack" && (
                  <>
                    <p className="mb-1.5 mt-2.5 text-[11.5px] text-gray-500">Quick Add (packs)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_PACKS.map((n) => (
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
                  </>
                )}
              </div>

              <div className="rounded-lg border border-[#e8ebee] p-3">
                <p className="mb-2 text-[12.5px] font-medium text-gray-700">Rate / {batch.purchase_unit_type} (₹)</p>
                <p className="text-[26px] font-extrabold leading-none text-[var(--c-deep)]">{amount(ratePack)}</p>
                <p className="mt-2 text-[11.5px] text-gray-500">
                  List ₹{amount(batch.selling_price)} · MRP ₹{amount(batch.mrp)}
                </p>
                {linePct > 0 && <p className="mt-1 text-[11.5px] font-semibold text-[var(--c-deep)]">−{linePct}% applied</p>}
              </div>

              <div className="rounded-lg border border-[#e8ebee] p-3">
                <p className="mb-2 text-[12.5px] font-medium text-gray-700">Amount (₹)</p>
                <p className="text-[26px] font-extrabold leading-none text-[var(--c-deep)]">{amount(lineValue)}</p>
                <p className="mt-2 text-[11.5px] text-gray-500">
                  {unit === "box" && `${qty} box${qty === 1 ? "" : "es"} = `}
                  {round2(packs)} {batch.purchase_unit_type}s = {units} {unitNoun(batch.purchase_unit_type, packSize)}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg bg-[var(--c-mint)] px-4 py-3">
              <div>
                <p className="text-[11px] text-gray-500">Customer discount</p>
                <p className="text-[13px] font-bold text-gray-900">{customerDiscount}%</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500">Quantity discount</p>
                <p className="text-[13px] font-bold text-gray-900">{tierPercent(tiers, packs)}%</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500">Stock after sale</p>
                <p className="text-[13px] font-bold text-gray-900">{Math.max(0, batch.stock_qty - units)} units</p>
              </div>
              {moq > 0 && packs < moq && (
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-700">
                  <AlertTriangle className="h-4 w-4" /> Below MOQ ({moq})
                </p>
              )}
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
            <p className="text-sm font-semibold text-gray-700">Search a medicine to start the order</p>
            <p className="max-w-xs text-[12.5px] text-gray-500">
              Wholesale prices, the customer&rsquo;s discount and quantity tiers are applied automatically.
            </p>
          </Card>
        )}
      </section>

      {/* ============================ MIDDLE: current bill ================= */}
      <section className="xl:col-span-4">
        <Card className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-[#eef1f3] px-4 py-3.5">
            <h3 className="text-[14px] font-bold uppercase tracking-wide text-gray-900">Current Order</h3>
            <p className="text-[12px] font-semibold text-gray-600">
              {totals.itemCount} lines · {totals.totalQty} units
            </p>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full min-w-[380px]">
              <thead>
                <tr className="bg-[#fafbfc] text-gray-600">
                  <th className="px-1.5 py-2.5 text-left text-[11px] font-semibold">#</th>
                  <th className="px-1.5 py-2.5 text-left text-[11px] font-semibold">Type</th>
                  <th className="px-1.5 py-2.5 text-left text-[11px] font-semibold">Product</th>
                  <th className="px-1.5 py-2.5 text-center text-[11px] font-semibold">Packs</th>
                  <th className="px-1.5 py-2.5 text-right text-[11px] font-semibold">Disc %</th>
                  <th className="px-1.5 py-2.5 text-right text-[11px] font-semibold">Amount (₹)</th>
                  <th className="px-1.5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f3f5]">
                {lines.map((line, index) => {
                  const { pct, perUnit } = priceOf(line);
                  return (
                    <tr key={line.key} className="align-middle">
                      <td className="px-1.5 py-3 text-[12px] text-gray-500">{index + 1}</td>
                      <td className="px-1.5 py-3 text-[11.5px] font-medium text-gray-700">{line.product_type || "—"}</td>
                      <td className="px-1.5 py-3">
                        <p className="text-[12.5px] font-semibold leading-tight text-gray-900">{line.generic_name}</p>
                        <p className="text-[11px] text-gray-500">
                          {line.batch_no} · {line.qty} units · ₹{amount(perUnit * line.pack_size)}/pack
                        </p>
                      </td>
                      <td className="px-1.5 py-3">
                        <input
                          type="number"
                          value={round2(line.qty / line.pack_size)}
                          onChange={(e) => changeLinePacks(line.key, Number(e.target.value) || 1)}
                          className="mx-auto block h-7 w-[52px] rounded-md border border-[#e3e7ea] text-center text-[12.5px] font-bold outline-none transition focus:border-[var(--c-primary)]"
                        />
                      </td>
                      <td className="px-1.5 py-3 text-right text-[12.5px] text-gray-700">{pct}</td>
                      <td className="px-1.5 py-3 text-right text-[12.5px] font-bold text-gray-900">
                        {amount(round2(perUnit * line.qty))}
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
                  );
                })}
                {!lines.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-14 text-center text-[13px] text-gray-400">
                      No items yet — search a medicine and press ADD TO BILL (F5)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {moqProblems.length > 0 && (
            <div className="mx-3 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              Minimum order not met: {moqProblems.join(" · ")}
            </div>
          )}

          <div className="border-t border-[#eef1f3] p-3">
            <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">
              Held orders ({held.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {held.map((h) => (
                <button
                  key={h.id}
                  onClick={() => restoreHeld(h.id)}
                  className="cursor-pointer rounded-md border border-[#e3e7ea] px-2.5 py-1 text-[11.5px] font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {h.lines.length} items ·{" "}
                  {new Date(h.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </button>
              ))}
              {!held.length && <span className="text-[12px] text-gray-400">None</span>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                onClick={clearBill}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#e3e7ea] py-2.5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                <Trash2 className="h-4 w-4 text-red-500" /> Clear
              </button>
              <button
                onClick={holdBill}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#e3e7ea] py-2.5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                <PauseCircle className="h-4 w-4 text-[var(--c-deep)]" /> Hold (F6)
              </button>
            </div>
          </div>
        </Card>
      </section>

      {/* ============================ RIGHT: customer + summary ============ */}
      <section className="xl:col-span-3">
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-[14px] font-bold uppercase tracking-wide text-[var(--c-deep)]">
            <Building2 className="h-4 w-4" /> Pharmacy
          </h3>
          {customer ? (
            <div className="rounded-lg border border-[#e5e7eb] bg-[#fafbfc] p-3 text-[12.5px]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-bold text-gray-900">{customer.name}</p>
                  <p className="text-gray-500">
                    {customer.id}
                    {customer.business_type ? ` · ${customer.business_type}` : ""}
                  </p>
                  {customer.gstin && <p className="text-gray-500">GSTIN {customer.gstin}</p>}
                </div>
                <button
                  onClick={() => setCustomerId("")}
                  aria-label="Change customer"
                  className="cursor-pointer text-gray-400 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] text-gray-500">Outstanding</p>
                  <p className={`font-bold ${outstanding > 0 ? "text-amber-700" : "text-gray-900"}`}>{money(outstanding)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-500">Credit limit</p>
                  <p className="font-bold text-gray-900">{creditLimit > 0 ? money(creditLimit) : "No limit"}</p>
                </div>
              </div>
            </div>
          ) : newPharmacy ? (
            <div className="space-y-2 rounded-lg border border-[var(--c-primary)] bg-[var(--c-mint)]/40 p-3">
              <p className="text-[12.5px] font-bold text-gray-900">New pharmacy</p>
              <input
                autoFocus
                value={newPharmacy.name}
                onChange={(e) => setNewPharmacy({ ...newPharmacy, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && savePharmacy()}
                placeholder="Pharmacy name *"
                className="field"
              />
              <input
                value={newPharmacy.phone}
                onChange={(e) => setNewPharmacy({ ...newPharmacy, phone: e.target.value })}
                placeholder="Phone"
                inputMode="tel"
                className="field"
              />
              <input
                value={newPharmacy.gstin}
                onChange={(e) => setNewPharmacy({ ...newPharmacy, gstin: e.target.value.toUpperCase() })}
                placeholder="GSTIN"
                className="field"
              />
              <textarea
                value={newPharmacy.address}
                onChange={(e) => setNewPharmacy({ ...newPharmacy, address: e.target.value })}
                placeholder="Address"
                rows={2}
                className="field h-auto py-2"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setNewPharmacy(null)}
                  className="flex-1 cursor-pointer rounded-lg border border-[#e3e7ea] bg-white py-2 text-[12.5px] font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={savePharmacy}
                  disabled={addingPharmacy}
                  className="flex-1 cursor-pointer rounded-lg bg-[var(--c-deep)] py-2 text-[12.5px] font-bold text-white hover:bg-[var(--c-hover)] disabled:cursor-wait disabled:opacity-60"
                >
                  {addingPharmacy ? "Saving…" : "Save & select"}
                </button>
              </div>
              <p className="text-[11px] text-gray-500">Credit limit and discount can be set later under Customers.</p>
            </div>
          ) : (
            <div className="relative">
              <div className="flex gap-2">
                <input
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  placeholder="Search pharmacy name, phone, GSTIN"
                  className="field"
                />
                <button
                  onClick={() =>
                    // Start the form from what was typed: digits → phone, otherwise → name.
                    setNewPharmacy(
                      /^[\d\s+]+$/.test(customerQuery.trim())
                        ? { name: "", phone: customerQuery.trim(), gstin: "", address: "" }
                        : { name: customerQuery.trim(), phone: "", gstin: "", address: "" },
                    )
                  }
                  className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-[var(--c-primary)] bg-white px-3 text-[12.5px] font-bold text-[var(--c-deep)] hover:bg-[var(--c-mint)]"
                >
                  <Plus className="h-4 w-4" /> New
                </button>
              </div>
              <div className="mt-2 max-h-[180px] overflow-y-auto rounded-lg border border-[#e5e7eb]">
                {customerResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCustomerId(c.id);
                      setCustomerQuery("");
                      setShipTo(c.shipping_address || "");
                    }}
                    className="block w-full cursor-pointer border-b border-[#f3f5f7] px-3 py-2 text-left last:border-0 hover:bg-gray-50"
                  >
                    <span className="block text-[12.5px] font-semibold text-gray-900">{c.name}</span>
                    <span className="block text-[11px] text-gray-500">
                      {c.id} · {c.phone || "no phone"}
                    </span>
                  </button>
                ))}
                {!customerResults.length && (
                  <p className="px-3 py-4 text-center text-[12px] text-gray-400">
                    No pharmacy found — tap <b>+ New</b> to add it.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 space-y-2.5 text-[13px]">
            <Row label={`Sub Total (MRP, ${totals.itemCount} items)`} value={money(totals.subTotal)} />
            <Row label="Discount" value={money(totals.discount)} green />
            {billOffer.offer && (
              <Row
                label={`Bill offer (${billOffer.offer.percent}% on ₹${amount(billOffer.offer.min_amount)}+)`}
                value={`− ${money(billOffer.discount)}`}
                green
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
              <span className="text-[12.5px] text-gray-700">Payment</span>
              <Select
                value={payment}
                onChange={(e) => setPayment(e.target.value as PaymentMethod)}
                className="h-9 w-[130px] py-0 text-[13px]"
              >
                {paymentMethods.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] text-gray-700">{isCredit ? "Paid now (₹)" : "Received (₹)"}</span>
              <input
                type="number"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                placeholder={isCredit ? "0.00" : amount(payable)}
                className="h-9 w-[130px] rounded-lg border border-[#d8dde3] px-2.5 text-right text-[13px] font-semibold outline-none focus:border-[var(--c-primary)]"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] text-gray-700">Txn / Cheque No.</span>
              <input
                value={txnRef}
                onChange={(e) => setTxnRef(e.target.value)}
                className="h-9 w-[130px] rounded-lg border border-[#d8dde3] px-2.5 text-right text-[13px] font-semibold outline-none focus:border-[var(--c-primary)]"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] text-gray-700">Invoice date</span>
              <input
                type="date"
                max={todayIso()}
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className="h-9 w-[130px] rounded-lg border border-[#d8dde3] px-2 text-[12.5px] outline-none focus:border-[var(--c-primary)]"
              />
            </div>
            {customer && (
              <div>
                <span className="text-[12.5px] text-gray-700">Ship to</span>
                <textarea
                  value={shipTo}
                  onChange={(e) => setShipTo(e.target.value)}
                  rows={2}
                  placeholder={customer.address || "Shipping address"}
                  className="mt-1 w-full resize-y rounded-lg border border-[#d8dde3] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[var(--c-primary)]"
                />
              </div>
            )}
            {isCredit && (
              <div className="rounded-lg bg-[#fafbfc] px-3 py-2 text-[12.5px]">
                <div className="flex justify-between">
                  <span className="text-gray-600">Due on this bill</span>
                  <span className="font-bold text-amber-700">{money(dueNow)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Due date ({creditDays} days)</span>
                  <span className="font-semibold text-gray-900">{dueDate.split("-").reverse().join("/")}</span>
                </div>
                {overLimit && <p className="mt-1 font-semibold text-red-600">Over credit limit</p>}
              </div>
            )}
          </div>

          <button
            onClick={checkout}
            disabled={submitting}
            className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--c-deep)] py-3.5 text-[13.5px] font-bold uppercase tracking-wide text-white transition hover:bg-[var(--c-hover)] disabled:cursor-wait disabled:opacity-60"
          >
            <Printer className="h-[18px] w-[18px]" /> {submitting ? "Saving…" : "Save & Print (F12)"}
          </button>

          {tiers.length > 0 && (
            <p className="mt-3 text-[11px] leading-snug text-gray-500">
              Quantity discounts: {tiers.map((t) => `${t.min_packs}+ packs −${t.percent}%`).join(" · ")}
            </p>
          )}
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-gray-500">
            <Info className="mt-[1px] h-3.5 w-3.5 shrink-0 text-gray-400" />
            GST is included in the wholesale price; the GST % only indicates the applicable rate.
          </p>
        </Card>
      </section>

      {notice && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-[var(--c-deep)] px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {notice}
        </div>
      )}
    </div>
  );
};

const Row = ({ label, value, green }: { label: string; value: string; green?: boolean }) => (
  <div className="flex items-center justify-between">
    <span className="text-gray-600">{label}</span>
    <span className={`font-semibold ${green ? "text-[var(--c-deep)]" : "text-gray-900"}`}>{value}</span>
  </div>
);
