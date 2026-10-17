"use client";

import React, { useMemo, useState } from "react";
import { Plus, Trash2, PackageCheck, XCircle, Undo2 } from "lucide-react";
import type { BatchRow, MedicineWithBatches, PurchaseOrder, PurchaseOrderItem, PurchaseReturn, Supplier } from "@/lib/types";
import { amount, dateSlash, monthShort, todayIso } from "@/lib/format";
import { round2 } from "@/lib/calc";
import { createPurchaseReturn, savePurchaseOrder, setPurchaseOrderStatus } from "@/lib/actions";
import { Button, Card, Field, Pill, Select, TextInput } from "./ui";
import { act, useMode } from "./mode-context";

/** A purchase-order line handed to the goods-receipt form. */
export type ReceiveDraft = PurchaseOrderItem & { supplier_id: string | null };

const STATUS_TONE: Record<PurchaseOrder["status"], "blue" | "green" | "gray"> = {
  ORDERED: "blue",
  RECEIVED: "green",
  CANCELLED: "gray",
};

/* ------------------------------------------------------------------------
   Purchase orders
   ------------------------------------------------------------------------ */

export const PurchaseOrders = ({
  medicines,
  suppliers,
  orders,
  onReceive,
  onChanged,
}: {
  medicines: MedicineWithBatches[];
  suppliers: Supplier[];
  orders: PurchaseOrder[];
  onReceive: (draft: ReceiveDraft) => void;
  onChanged: (message: string) => void;
}) => {
  const mode = useMode();
  const [supplierId, setSupplierId] = useState("");
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [line, setLine] = useState({ name: "", packs: "", pack_size: "", rate: "" });
  const [saving, setSaving] = useState(false);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);

  const supplierName = (id: string | null) => suppliers.find((s) => s.id === id)?.name || "—";
  const medicine = medicines.find((m) => m.generic_name.toLowerCase() === line.name.trim().toLowerCase());

  const addLine = () => {
    if (!medicine) return;
    const packs = Math.floor(Number(line.packs) || 0);
    if (packs <= 0) return;
    const lastBatch = medicine.batches[medicine.batches.length - 1];
    setItems([
      ...items,
      {
        medicine_id: medicine.id,
        generic_name: medicine.generic_name,
        packs,
        pack_size: Math.max(1, Math.floor(Number(line.pack_size) || lastBatch?.pack_size || 1)),
        rate: round2(Number(line.rate) || lastBatch?.purchase_rate || 0),
      },
    ]);
    setLine({ name: "", packs: "", pack_size: "", rate: "" });
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const res = await act(
      savePurchaseOrder(mode, { supplier_id: supplierId, expected_date: expected, items, notes }),
    );
    setSaving(false);
    if (!res.ok) return;
    setItems([]);
    setNotes("");
    setExpected("");
    onChanged("Purchase order created.");
  };

  const orderValue = (o: { items: PurchaseOrderItem[] }) => round2(o.items.reduce((s, i) => s + i.packs * i.rate, 0));

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="mb-4 text-[15px] font-bold text-gray-900">New Purchase Order</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Supplier">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Expected delivery">
            <TextInput type="date" value={expected} min={todayIso()} onChange={(e) => setExpected(e.target.value)} />
          </Field>
          <Field label="Notes">
            <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-12">
          <Field label="Medicine" className="col-span-2 md:col-span-5">
            <TextInput
              list="po-medicines"
              value={line.name}
              onChange={(e) => setLine({ ...line, name: e.target.value })}
              placeholder="Pick from catalogue"
            />
            <datalist id="po-medicines">
              {medicines.map((m) => (
                <option key={m.id} value={m.generic_name} />
              ))}
            </datalist>
          </Field>
          <Field label="Packs" className="md:col-span-2">
            <TextInput type="number" value={line.packs} onChange={(e) => setLine({ ...line, packs: e.target.value })} />
          </Field>
          <Field label="Units / pack" className="md:col-span-2">
            <TextInput
              type="number"
              value={line.pack_size}
              onChange={(e) => setLine({ ...line, pack_size: e.target.value })}
              placeholder={String(medicine?.batches.at(-1)?.pack_size ?? "")}
            />
          </Field>
          <Field label="Rate / pack (₹)" className="md:col-span-2">
            <TextInput
              type="number"
              value={line.rate}
              onChange={(e) => setLine({ ...line, rate: e.target.value })}
              placeholder={String(medicine?.batches.at(-1)?.purchase_rate ?? "")}
            />
          </Field>
          <div className="flex items-end md:col-span-1">
            <Button variant="ghost" className="w-full" onClick={addLine} disabled={!medicine || !(Number(line.packs) > 0)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {line.name.trim() && !medicine && (
          <p className="mt-1 text-[11.5px] text-[#1f6feb]">
            Pick a medicine from the catalogue. New medicines are added from Goods Receipt.
          </p>
        )}

        {items.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-[#e5e7eb]">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="bg-[#f4f6f8] text-gray-700">
                  <th className="th">Medicine</th>
                  <th className="th text-right">Packs</th>
                  <th className="th text-right">Units / pack</th>
                  <th className="th text-right">Rate (₹)</th>
                  <th className="th text-right">Value (₹)</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f3f5]">
                {items.map((i, idx) => (
                  <tr key={`${i.medicine_id}-${idx}`}>
                    <td className="td">{i.generic_name}</td>
                    <td className="td text-right">{i.packs}</td>
                    <td className="td text-right">{i.pack_size}</td>
                    <td className="td text-right">{amount(i.rate)}</td>
                    <td className="td text-right font-semibold">{amount(i.packs * i.rate)}</td>
                    <td className="td text-right">
                      <button
                        onClick={() => setItems(items.filter((_, n) => n !== idx))}
                        aria-label="Remove line"
                        className="cursor-pointer text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          <span className="text-[13px] text-gray-600">
            Order value: <b className="text-gray-900">₹ {amount(orderValue({ items }))}</b>
          </span>
          <Button onClick={save} disabled={saving || !items.length || !supplierId}>
            {saving ? "Saving…" : "Create order"}
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="bg-[#f4f6f8] text-gray-700">
                <th className="th">PO No</th>
                <th className="th">Date</th>
                <th className="th">Supplier</th>
                <th className="th">Items</th>
                <th className="th">Expected</th>
                <th className="th text-right">Value (₹)</th>
                <th className="th">Status</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f3f5]">
              {orders.map((o) => (
                <tr key={o.id} className="align-top">
                  <td className="td font-semibold text-gray-900">{o.po_no}</td>
                  <td className="td">{dateSlash(o.order_date)}</td>
                  <td className="td">{supplierName(o.supplier_id)}</td>
                  <td className="td text-[12.5px] text-gray-600">
                    {o.items.map((i) => `${i.generic_name} × ${i.packs}`).join(", ")}
                  </td>
                  <td className="td">{o.expected_date ? dateSlash(o.expected_date) : "—"}</td>
                  <td className="td text-right font-semibold">{amount(orderValue(o))}</td>
                  <td className="td">
                    <Pill tone={STATUS_TONE[o.status]}>{o.status}</Pill>
                  </td>
                  <td className="td">
                    {o.status === "ORDERED" && (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setReceiving(o)}
                          className="cursor-pointer rounded-md border border-[#d8dde3] px-2.5 py-1 text-[12px] font-semibold text-[var(--c-deep)] hover:bg-gray-50"
                        >
                          Receive
                        </button>
                        <button
                          onClick={async () => {
                            const res = await act(setPurchaseOrderStatus(mode, o.id, "RECEIVED"));
                            if (res.ok) onChanged(`${o.po_no} marked received.`);
                          }}
                          aria-label="Mark received"
                          title="Mark received"
                          className="cursor-pointer rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-[var(--c-deep)]"
                        >
                          <PackageCheck className="h-4 w-4" />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Cancel ${o.po_no}?`)) return;
                            const res = await act(setPurchaseOrderStatus(mode, o.id, "CANCELLED"));
                            if (res.ok) onChanged(`${o.po_no} cancelled.`);
                          }}
                          aria-label="Cancel order"
                          title="Cancel order"
                          className="cursor-pointer rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!orders.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center text-[13.5px] text-gray-400">
                    No purchase orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {receiving && (
        <Card className="p-4">
          <p className="mb-2 text-[13px] font-semibold text-gray-900">
            Receive {receiving.po_no} — pick a line to fill the goods-receipt form:
          </p>
          <div className="flex flex-wrap gap-2">
            {receiving.items.map((i, idx) => (
              <Button
                key={`${i.medicine_id}-${idx}`}
                variant="ghost"
                className="py-2 text-[12.5px]"
                onClick={() => {
                  onReceive({ ...i, supplier_id: receiving.supplier_id });
                  setReceiving(null);
                }}
              >
                {i.generic_name} × {i.packs}
              </Button>
            ))}
            <Button variant="ghost" className="py-2 text-[12.5px]" onClick={() => setReceiving(null)}>
              Close
            </Button>
          </div>
          <p className="mt-2 text-[11.5px] text-gray-500">
            Enter batch, expiry and prices on the receipt, save, then mark the order received once every line is in.
          </p>
        </Card>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------------
   Purchase returns (stock going back to a supplier)
   ------------------------------------------------------------------------ */

export const PurchaseReturns = ({
  rows,
  returns,
  suppliers,
  onChanged,
}: {
  rows: BatchRow[];
  returns: PurchaseReturn[];
  suppliers: Supplier[];
  onChanged: (message: string) => void;
}) => {
  const mode = useMode();
  const [batchId, setBatchId] = useState("");
  const [qty, setQty] = useState("");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const inStock = useMemo(() => rows.filter((r) => r.batch.stock_qty > 0), [rows]);
  const row = inStock.find((r) => r.batch.id === batchId);
  const units = Math.floor(Number(qty) || 0);
  const autoValue = row ? round2((row.batch.purchase_rate / (row.batch.pack_size || 1)) * units) : 0;

  const submit = async () => {
    if (!row || units <= 0 || saving) return;
    setSaving(true);
    const res = await act(
      createPurchaseReturn(mode, {
        batch_id: row.batch.id,
        qty: units,
        amount: Number(value) > 0 ? Number(value) : undefined,
        reason,
      }),
    );
    setSaving(false);
    if (!res.ok) return;
    setBatchId("");
    setQty("");
    setValue("");
    setReason("");
    onChanged(`Returned ${units} units of ${row.medicine.generic_name} to the supplier.`);
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="mb-1 text-[15px] font-bold text-gray-900">Return Stock to Supplier</h3>
        <p className="mb-4 text-[12px] text-gray-500">
          Removes the units from this batch and credits the value against the supplier&rsquo;s balance.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <Field label="Batch" className="md:col-span-5">
            <Select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              <option value="">Select batch</option>
              {inStock.map((r) => (
                <option key={r.batch.id} value={r.batch.id}>
                  {r.medicine.generic_name} · {r.batch.batch_no} · EXP {monthShort(r.batch.exp_date)} · {r.batch.stock_qty} left ·{" "}
                  {r.supplier_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Units" className="md:col-span-2">
            <TextInput type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Credit value (₹)" className="md:col-span-2" hint={autoValue ? `At cost: ₹${amount(autoValue)}` : undefined}>
            <TextInput type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder={autoValue ? String(autoValue) : ""} />
          </Field>
          <Field label="Reason" className="md:col-span-3">
            <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damaged / near expiry / excess" />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={submit} disabled={!row || units <= 0 || saving}>
            <Undo2 className="h-4 w-4" /> {saving ? "Saving…" : "Record return"}
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="bg-[#f4f6f8] text-gray-700">
                <th className="th">Date</th>
                <th className="th">Medicine</th>
                <th className="th">Batch</th>
                <th className="th">Supplier</th>
                <th className="th text-right">Units</th>
                <th className="th text-right">Value (₹)</th>
                <th className="th">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f3f5]">
              {returns.map((r) => (
                <tr key={r.id}>
                  <td className="td">{dateSlash(r.created_at.slice(0, 10))}</td>
                  <td className="td">{r.generic_name}</td>
                  <td className="td">{r.batch_no}</td>
                  <td className="td">{suppliers.find((s) => s.id === r.supplier_id)?.name || "—"}</td>
                  <td className="td text-right">{r.qty}</td>
                  <td className="td text-right font-semibold">{amount(r.amount)}</td>
                  <td className="td text-[12.5px] text-gray-600">{r.reason || "—"}</td>
                </tr>
              ))}
              {!returns.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center text-[13.5px] text-gray-400">
                    No purchase returns yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
