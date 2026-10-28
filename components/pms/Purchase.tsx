"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Info, Save, Plus } from "lucide-react";
import type { BatchRow, DrugSchedule, LedgerData, MedicineWithBatches, PurchaseUnitType, Supplier } from "@/lib/types";
import {
  calcDiscount,
  calcPerUnitPrice,
  calcPurchaseCost,
  calcStockAdded,
  calcTotal,
} from "@/lib/calc";
import { amount, monthShort, packNoun, todayIso, unitNoun, splitsIntoUnits } from "@/lib/format";
import { useSettings } from "./data";
import { DEFAULT_PRODUCT_TYPES, DEFAULT_PURCHASE_UNITS, productTypeOptions } from "@/lib/product-types";
import { saveBatch, saveMedicine, saveSupplier } from "@/lib/actions";
import { Button, Card, Field, ScreenHeading, Select, TextInput } from "./ui";
import { act, useMode } from "./mode-context";
import { PurchaseOrders, PurchaseReturns, type ReceiveDraft } from "./PurchaseExtras";

export type { ReceiveDraft } from "./PurchaseExtras";

/** Dropdown options requested by the client (slide 9 / 10) */
const SCHEDULES: DrugSchedule[] = ["H", "H1", "X", "NRX", "OTC", "General"];

/** General items (lotions, face wash…) are always sold whole: one piece per pack, no boxes. */
const isSingleItem = (productType: string) => productType === "General";
const SINGLE_ITEM = { purchaseUnitType: "Piece" as PurchaseUnitType, packSize: "1", stripsPerBox: "" };

const blankForm = (defaultGst = 12) => ({
  supplierId: "",
  supplierName: "",
  invoiceNo: "",
  date: todayIso(),
  medicineId: "",
  medicineName: "",
  purchaseUnitType: "Strip" as PurchaseUnitType,
  schedule: "OTC" as DrugSchedule,
  productType: "",
  genericName: "",
  brandName: "",
  manufacturer: "",
  salt: "",
  hsnCode: "",
  batchNo: "",
  mfgDate: "",
  expDate: "",
  box: "",
  packSize: "",
  stripsPerBox: "",
  quantity: "",
  purchaseRate: "",
  mrp: "",
  sellingPrice: "",
  gst: String(defaultGst),
});

export const Purchase = ({
  medicines,
  suppliers,
  batchRows,
  ledger,
  onSaved,
}: {
  medicines: MedicineWithBatches[];
  suppliers: Supplier[];
  batchRows: BatchRow[];
  ledger?: LedgerData;
  onSaved: (message: string) => void;
}) => {
  const mode = useMode();
  const [tab, setTab] = useState<"receipt" | "orders" | "returns">("receipt");
  const [saving, setSaving] = useState(false);
  const { data: settings } = useSettings();
  const productTypes = settings?.product_types ?? DEFAULT_PRODUCT_TYPES;
  const purchaseUnits = settings?.purchase_units ?? DEFAULT_PURCHASE_UNITS;
  const defaultGst = settings?.default_gst ?? 12;
  const [form, setForm] = useState(() => blankForm(defaultGst));

  // Settings load asynchronously; apply the shop's default GST to a fresh form.
  const [appliedGst, setAppliedGst] = useState(defaultGst);
  if (appliedGst !== defaultGst) {
    setAppliedGst(defaultGst);
    if (!form.medicineId) setForm((prev) => ({ ...prev, gst: String(defaultGst) }));
  }
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState("");
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof ReturnType<typeof blankForm>>(
    key: K,
    value: ReturnType<typeof blankForm>[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    const away = (event: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  /* --------------------------- medicine lookup --------------------------- */
  const results = useMemo(() => {
    const q = form.medicineName.trim().toLowerCase();
    if (!q) return [];
    return medicines
      .filter(
        (m) =>
          m.generic_name.toLowerCase().includes(q) ||
          m.brand_name.toLowerCase().includes(q) ||
          m.manufacturer.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [form.medicineName, medicines]);

  const pickMedicine = (medicine: MedicineWithBatches) => {
    const last = medicine.batches[medicine.batches.length - 1];
    setForm((prev) => ({
      ...prev,
      medicineId: medicine.id,
      medicineName: medicine.generic_name,
      genericName: medicine.generic_name,
      // Brand / manufacturer are NOT copied from the medicine — they belong to
      // the batch being purchased and must be entered fresh each time.
      brandName: prev.brandName,
      manufacturer: prev.manufacturer,
      salt: medicine.salt,
      hsnCode: medicine.hsn_code,
      schedule: medicine.schedule,
      productType: medicine.product_type,
      purchaseUnitType: medicine.purchase_unit_type,
      gst: String(medicine.gst_percent),
      box: last?.box || prev.box,
      packSize: last ? String(last.pack_size) : prev.packSize,
      stripsPerBox: last?.strips_per_box ? String(last.strips_per_box) : prev.stripsPerBox,
      ...(isSingleItem(medicine.product_type) && SINGLE_ITEM),
    }));
    setShowResults(false);
  };

  /* --------------------------- auto calculations ------------------------- */
  const singleItem = isSingleItem(form.productType);
  // Only strips divide into tablets; a lotion or bottle is always one unit, so its price is never divided.
  const splits = !singleItem && splitsIntoUnits(form.purchaseUnitType);
  const packSize = splits ? Number(form.packSize) || 0 : 1;
  const stripsPerBox = singleItem ? 0 : Math.max(0, Math.floor(Number(form.stripsPerBox) || 0));
  const quantity = Number(form.quantity) || 0;
  const packWord = packNoun(form.purchaseUnitType);
  /** Whole boxes in the quantity entered (blank when it isn't a whole number of boxes) */
  const boxesInQuantity = stripsPerBox > 0 && quantity > 0 && quantity % stripsPerBox === 0 ? quantity / stripsPerBox : 0;
  const mrp = Number(form.mrp) || 0;
  const sellingPrice = Number(form.sellingPrice) || 0;
  const purchaseRate = Number(form.purchaseRate) || 0;

  const stockAdded = calcStockAdded(packSize, quantity);
  const total = calcTotal(mrp, quantity);
  const perUnitPrice = calcPerUnitPrice(sellingPrice, packSize);
  const discount = mrp > 0 && sellingPrice > 0 ? calcDiscount(mrp, sellingPrice) : 0;
  const purchaseCost = calcPurchaseCost(purchaseRate, quantity);
  const unitWord = unitNoun(form.purchaseUnitType, packSize);

  /* -------------------------------- save --------------------------------- */
  /** A purchase-order line, received against: fills the goods-receipt form. */
  const receiveFromOrder = (draft: ReceiveDraft) => {
    const medicine = medicines.find((m) => m.id === draft.medicine_id);
    const supplier = suppliers.find((x) => x.id === draft.supplier_id);
    setForm((prev) => ({
      ...blankForm(defaultGst),
      supplierId: supplier?.id || "",
      supplierName: supplier?.name || "",
      invoiceNo: prev.invoiceNo,
      date: todayIso(),
      medicineId: medicine?.id || "",
      medicineName: medicine?.generic_name || draft.generic_name,
      genericName: medicine?.generic_name || draft.generic_name,
      salt: medicine?.salt || "",
      hsnCode: medicine?.hsn_code || "",
      schedule: medicine?.schedule || "OTC",
      productType: medicine?.product_type || "",
      purchaseUnitType: medicine?.purchase_unit_type || "Strip",
      gst: String(medicine?.gst_percent ?? defaultGst),
      packSize: String(draft.pack_size || ""),
      quantity: String(draft.packs || ""),
      purchaseRate: draft.rate ? String(draft.rate) : "",
      ...(isSingleItem(medicine?.product_type || "") && SINGLE_ITEM),
    }));
    setTab("receipt");
  };

  const handleSave = async () => {
    if (saving) return;
    // The visible "Medicine" field drives genericName; fall back to it so a typed
    // name is never rejected as empty due to any state desync.
    const genericName = (form.genericName || form.medicineName).trim();
    if (!genericName) return setError("Enter the medicine (generic) name.");
    if (!form.brandName.trim()) return setError("Enter the brand name.");
    if (!form.batchNo.trim()) return setError("Enter the batch number.");
    if (!form.expDate) return setError("Expiry date (EXP DT) is mandatory.");
    if (packSize <= 0) return setError("Enter how many units are in one pack (e.g. 10 tablets per strip, or 1).");
    if (quantity <= 0) return setError("Quantity must be greater than zero.");
    if (mrp <= 0) return setError("Enter the MRP.");
    if (sellingPrice <= 0) return setError("Enter the selling price.");
    if (sellingPrice > mrp) return setError("Selling price cannot be higher than the MRP.");

    setError("");
    setSaving(true);
    try {

    // Resolve supplier: if text was typed and doesn't match any existing supplier,
    // create a new one on the fly.
    let resolvedSupplierId = form.supplierId || null;
    if (!resolvedSupplierId && form.supplierName.trim()) {
      const created = await act(saveSupplier(mode, { name: form.supplierName.trim(), phone: "", gstin: "" }));
      if (!created.ok) return;
      resolvedSupplierId = created.data;
    }

    const savedMedicine = await act(saveMedicine(mode, {
      id: form.medicineId || undefined,
      generic_name: genericName,
      // brand_name / manufacturer only passed for new medicine inserts (legacy field).
      brand_name: form.brandName.trim(),
      manufacturer: form.manufacturer.trim(),
      salt: form.salt.trim() || genericName,
      schedule: form.schedule,
      product_type: form.productType,
      hsn_code: form.hsnCode.trim(),
      gst_percent: Number(form.gst) || 0,
      purchase_unit_type: singleItem ? "Piece" : form.purchaseUnitType,
      ...(!form.medicineId && { low_stock_threshold: settings?.low_stock_threshold ?? 10 }),
    }));
    if (!savedMedicine.ok) return;
    const medicineId = savedMedicine.data;

    const savedBatch = await act(saveBatch(mode, {
      medicine_id: medicineId,
      supplier_id: resolvedSupplierId,
      brand_name: form.brandName.trim(),
      manufacturer: form.manufacturer.trim(),
      invoice_no: form.invoiceNo.trim(),
      purchase_date: form.date,
      batch_no: form.batchNo.trim(),
      mfg_date: form.mfgDate,
      exp_date: form.expDate,
      box: form.box.trim().toUpperCase(),
      purchase_unit_type: singleItem ? "Piece" : form.purchaseUnitType,
      pack_size: packSize,
      strips_per_box: stripsPerBox,
      qty_packs: quantity,
      stock_added: stockAdded,
      stock_qty: stockAdded,
      purchase_rate: purchaseRate,
      mrp,
      selling_price: sellingPrice,
      gst_percent: Number(form.gst) || 0,
    }));
    if (!savedBatch.ok) return;

    onSaved(`Stock added — ${stockAdded} ${unitWord} of ${genericName}.`);
    setForm({ ...blankForm(defaultGst), supplierId: resolvedSupplierId || "", supplierName: form.supplierName, invoiceNo: form.invoiceNo, date: form.date });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F5" && tab === "receipt") {
        event.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ScreenHeading>{mode === "wholesale" ? "Wholesale Purchase" : "Purchase"} (Add Stock)</ScreenHeading>
        <div className="mb-4 flex overflow-hidden rounded-lg border border-[#d8dde3]">
          {(
            [
              ["receipt", "Goods Receipt"],
              ["orders", "Purchase Orders"],
              ["returns", "Purchase Returns"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`cursor-pointer px-3.5 py-2 text-[13px] font-semibold transition ${
                tab === key ? "bg-[var(--c-deep)] text-white" : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "orders" && (
        <PurchaseOrders
          medicines={medicines}
          suppliers={suppliers}
          orders={ledger?.purchaseOrders ?? []}
          onReceive={receiveFromOrder}
          onChanged={onSaved}
        />
      )}

      {tab === "returns" && (
        <PurchaseReturns rows={batchRows} returns={ledger?.purchaseReturns ?? []} suppliers={suppliers} onChanged={onSaved} />
      )}

      {tab === "receipt" && (
      <Card className="p-5">
        {/* Supplier / Invoice / Date */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Supplier">
            {/* Combobox: pick from existing list OR type a new name */}
            <div className="relative">
              <input
                list="supplier-list"
                value={form.supplierName || suppliers.find((s) => s.id === form.supplierId)?.name || ""}
                onChange={(e) => {
                  const typed = e.target.value;
                  const match = suppliers.find((s) => s.name.toLowerCase() === typed.toLowerCase());
                  setForm((prev) => ({
                    ...prev,
                    supplierName: typed,
                    supplierId: match ? match.id : "",
                  }));
                }}
                placeholder="Select or type new supplier"
                className="h-11 w-full rounded-lg border border-[#dfe3e7] px-3 text-[13px] outline-none transition placeholder:text-gray-300 focus:border-[var(--c-primary)] focus:ring-2 focus:ring-[var(--c-primary)]/12"
              />
              <datalist id="supplier-list">
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </div>
            {form.supplierName && !form.supplierId && (
              <p className="mt-1 text-[11px] text-[#1f6feb]">New supplier — will be created on save.</p>
            )}
          </Field>
          <Field label="Invoice No">
            <TextInput
              value={form.invoiceNo}
              onChange={(e) => set("invoiceNo", e.target.value)}
              placeholder="INV-2456"
            />
          </Field>
          <Field label="Date">
            <div className="relative">
              <TextInput
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </div>
          </Field>
        </div>

        {/* Medicine / Purchase Unit / Drug Schedule / Product Type */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-5" ref={searchWrapRef}>
            <label className="field-label">Medicine</label>
            <div className="relative">
              <TextInput
                value={form.medicineName}
                onChange={(e) => {
                  // Update every derived field in one atomic write so medicineName
                  // and genericName can never fall out of sync (which was making the
                  // "Enter the medicine name" error show even after typing it).
                  const value = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    medicineName: value,
                    genericName: value,
                    medicineId: "",
                  }));
                  setShowResults(true);
                }}
                onFocus={() => setShowResults(true)}
                placeholder="Paracetamol 500 mg Tablet"
                className="pr-10"
              />
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

              {showResults && results.length > 0 && (
                <div className="absolute left-0 right-0 top-[46px] z-30 max-h-[280px] overflow-y-auto rounded-xl border border-[#e5e7eb] bg-white py-1.5 shadow-xl">
                  {results.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => pickMedicine(m)}
                      className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-gray-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-semibold text-gray-900">
                          {m.generic_name}
                        </span>
                        <span className="block truncate text-[11.5px] text-gray-500">
                          {(() => {
                            // Show brands from all batches of this medicine
                            const batchBrands = [...new Set(
                              m.batches.map((b) => b.brand_name).filter(Boolean)
                            )].join(" / ");
                            return batchBrands || m.brand_name || "";
                          })()} · HSN {m.hsn_code}
                        </span>
                      </span>
                      <span className="shrink-0 text-[12px] font-semibold text-[var(--c-deep)]">
                        {m.total_stock} in stock
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!form.medicineId && form.medicineName.trim() && (
              <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-[#1f6feb]">
                <Plus className="h-3.5 w-3.5" /> New medicine — it will be added to the medicine
                master on save.
              </p>
            )}
          </div>

          <Field label="Pack Type" className="md:col-span-2">
            <Select
              value={form.purchaseUnitType}
              disabled={singleItem}
              onChange={(e) => set("purchaseUnitType", e.target.value as PurchaseUnitType)}
            >
              {productTypeOptions(purchaseUnits, form.purchaseUnitType).map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Drug Schedule" className="md:col-span-2">
            <Select
              value={form.schedule}
              onChange={(e) => set("schedule", e.target.value as DrugSchedule)}
            >
              {SCHEDULES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Product Type" className="md:col-span-3">
            <Select
              value={form.productType}
              onChange={(e) => {
                const productType = e.target.value;
                setForm((prev) => ({ ...prev, productType, ...(isSingleItem(productType) && SINGLE_ITEM) }));
              }}
            >
              <option value="">— Select —</option>
              {productTypeOptions(productTypes, form.productType).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Medicine batch details */}
        <p className="mb-2 mt-6 text-[13px] font-semibold text-gray-800">Medicine Batch Details</p>
        <div className="rounded-lg border border-[#e5e7eb] bg-white p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <Field label="Brand name">
              <TextInput
                value={form.brandName}
                onChange={(e) => set("brandName", e.target.value)}
                placeholder="Paracip"
              />
            </Field>
            <Field label="Company">
              <TextInput
                value={form.manufacturer}
                onChange={(e) => set("manufacturer", e.target.value)}
                placeholder="Zydus Healthcare"
              />
            </Field>
            <Field label="HSN Code">
              <TextInput
                value={form.hsnCode}
                onChange={(e) => set("hsnCode", e.target.value)}
                placeholder="30049099"
              />
            </Field>
            <Field label="Batch no">
              <TextInput
                value={form.batchNo}
                onChange={(e) => set("batchNo", e.target.value)}
                placeholder="P500A2306"
              />
            </Field>
            <Field label="MFG DT">
              <TextInput
                type="month"
                value={form.mfgDate}
                onChange={(e) => set("mfgDate", e.target.value)}
              />
            </Field>
            <Field label="EXP DT">
              <TextInput
                type="month"
                value={form.expDate}
                onChange={(e) => set("expDate", e.target.value)}
              />
            </Field>
            <Field label="Box">
              <TextInput
                value={form.box}
                onChange={(e) => set("box", e.target.value.toUpperCase())}
                placeholder="A1"
              />
            </Field>
          </div>
        </div>

        {/* Purchase calculation */}
        <p className="mb-2 mt-6 text-[13px] font-semibold text-gray-800">Purchase Calculation</p>
        <div className="space-y-3">
          <CalcGroup label="Stock" tone="gray">
            {singleItem ? (
              <CalcReadonly label="Pack" value="1 piece (General item)" />
            ) : (
            <>
            {splits ? (
              <Field label="Tablets per strip" hint="e.g. 10 — billing can sell single tablets">
                <TextInput
                  type="number"
                  value={form.packSize}
                  onChange={(e) => set("packSize", e.target.value)}
                  placeholder="10"
                />
              </Field>
            ) : (
              <CalcReadonly label="Pack" value={`Sold whole — 1 per ${form.purchaseUnitType.toLowerCase() || "piece"}`} />
            )}
            <Field label={`${packWord} per box`}>
              <TextInput
                type="number"
                value={form.stripsPerBox}
                onChange={(e) => set("stripsPerBox", e.target.value)}
                placeholder="e.g. 10"
              />
            </Field>
            {stripsPerBox > 0 && (
              <Field label="Boxes">
                <TextInput
                  type="number"
                  value={boxesInQuantity ? String(boxesInQuantity) : ""}
                  onChange={(e) => {
                    const boxes = Math.max(0, Math.floor(Number(e.target.value) || 0));
                    set("quantity", boxes ? String(boxes * stripsPerBox) : "");
                  }}
                  placeholder="2"
                />
              </Field>
            )}
            </>
            )}
            <Field label={`Quantity (${packWord})`}>
              <TextInput
                type="number"
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
                placeholder="2"
              />
            </Field>
          </CalcGroup>

          <CalcGroup label="You pay — supplier" tone="blue">
            <Field label="Purchase Rate (₹)">
              <TextInput
                type="number"
                value={form.purchaseRate}
                onChange={(e) => set("purchaseRate", e.target.value)}
                placeholder="20"
              />
            </Field>
            <CalcReadonly label="Purchase Total (₹)" value={purchaseCost ? amount(purchaseCost) : "—"} />
          </CalcGroup>

          <CalcGroup label={mode === "wholesale" ? "Buyer pays — wholesale" : "Customer pays — retail"} tone="green">
            <Field label="MRP (₹)">
              <TextInput
                type="number"
                value={form.mrp}
                onChange={(e) => set("mrp", e.target.value)}
                placeholder="60"
              />
            </Field>
            <CalcReadonly label="MRP Total (₹)" value={total ? amount(total) : "—"} />
            <Field label="Selling Price (₹)">
              <TextInput
                type="number"
                value={form.sellingPrice}
                onChange={(e) => set("sellingPrice", e.target.value)}
                placeholder="40"
              />
            </Field>
            <CalcReadonly label="Per unit price" value={perUnitPrice ? amount(perUnitPrice) : "—"} />
            <Field label="GST %">
              <TextInput
                type="number"
                value={form.gst}
                onChange={(e) => set("gst", e.target.value)}
                placeholder="12"
              />
            </Field>
            <CalcReadonly
              label="Discount"
              value={discount ? amount(discount) : "—"}
              tone="green"
            />
          </CalcGroup>
        </div>

        <p className="mt-2 text-[11.5px] text-gray-500">
          The read-only fields fill in on their own — Stock Added, Purchase Total, MRP Total, Per unit
          price and Discount. Every other field is typed in.
        </p>

        {/* Totals strip */}
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#e5e7eb] bg-[#e5e7eb] sm:grid-cols-4">
          <SummaryCell label={`Total ${form.purchaseUnitType}s`} value={quantity ? String(quantity) : "—"} />
          <SummaryCell
            label="Purchase Total (you pay)"
            value={purchaseCost ? `₹ ${amount(purchaseCost)}` : "—"}
          />
          <SummaryCell label="MRP Total (retail value)" value={total ? `₹ ${amount(total)}` : "—"} />
          <SummaryCell
            label={`Total ${unitWord} Added`}
            value={stockAdded ? String(stockAdded) : "—"}
            highlight
          />
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-700">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          <Button variant="ghost" onClick={() => setForm(blankForm(defaultGst))}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save (F5)"}
          </Button>
        </div>

        {/* Info bar */}
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[#dbe7f8] bg-[#f5f9ff] px-4 py-3">
          <Info className="mt-[1px] h-[18px] w-[18px] shrink-0 text-[#1f6feb]" />
          <p className="text-[13px] text-[#1c4f9c]">
            {stockAdded > 0 ? (
              <>
                Stock will be added as <b>{stockAdded} {unitWord}</b> in inventory ({quantity}{" "}
                {form.purchaseUnitType}
                {quantity === 1 ? "" : "s"} × {packSize} = {stockAdded} {unitWord})
                {boxesInQuantity ? ` · ${boxesInQuantity} box${boxesInQuantity === 1 ? "" : "es"} of ${stripsPerBox} ${packWord}` : ""}
                {form.expDate ? ` · Expires ${monthShort(form.expDate)}` : ""}
                {form.box ? ` · Box ${form.box}` : ""}
              </>
            ) : (
              <>Enter the Purchase Unit and Quantity to see how much stock will be added.</>
            )}
          </p>
        </div>

        <p className="mt-3 text-[11.5px] text-gray-500">
          Note: GST is included in the MRP and Selling Price. The GST % only indicates the applicable
          tax rate — no additional GST is added on top.
        </p>
        <p className="mt-1 text-[11.5px] text-gray-500">
          Stock received here is added to the {mode} inventory only. The medicine itself is shared with the
          other dashboard&rsquo;s catalogue.
        </p>
      </Card>
      )}
    </div>
  );
};

/* ---------------------- purchase calculation blocks ---------------------- */

const CalcGroup = ({
  label,
  tone = "gray",
  children,
}: {
  label: string;
  tone?: "gray" | "blue" | "green";
  children: React.ReactNode;
}) => {
  const tones: Record<string, string> = {
    gray: "bg-[#f4f6f8] text-gray-600",
    blue: "bg-[#eaf1fe] text-[#1f6feb]",
    green: "bg-[var(--c-mint)] text-[var(--c-deep)]",
  };
  return (
    <div className="overflow-hidden rounded-lg border border-[#e5e7eb] bg-white">
      <p
        className={`px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.09em] ${tones[tone]}`}
      >
        {label}
      </p>
      <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3 xl:grid-cols-6">
        {children}
      </div>
    </div>
  );
};

const CalcReadonly = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green";
}) => (
  <div>
    <label className="field-label">{label}</label>
    <div
      className={`flex h-[42px] items-center justify-center rounded-lg border border-dashed border-[#cfd6e4] bg-[#f6f8fd] px-3 text-[14px] font-bold ${
        tone === "green" ? "text-[var(--c-deep)]" : "text-gray-900"
      }`}
    >
      {value}
    </div>
  </div>
);

const SummaryCell = ({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) => (
  <div className="bg-white px-4 py-3.5">
    <p className="text-[12px] text-gray-500">{label}</p>
    <p className={`text-[19px] font-bold ${highlight ? "text-[var(--c-deep)]" : "text-gray-900"}`}>
      {value}
    </p>
  </div>
);
