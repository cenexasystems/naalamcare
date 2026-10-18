"use client";

import React, { useMemo, useState } from "react";
import { Search, Plus, Pencil, Trash2, Receipt, Download } from "lucide-react";
import type { BatchRow, LedgerData, Supplier } from "@/lib/types";
import { amount, dateSlash, money, todayIso } from "@/lib/format";
import { round2 } from "@/lib/calc";
import { deleteSupplier, recordSupplierPayment } from "@/lib/actions";
import { downloadExcel } from "@/lib/xlsx";
import { Button, Card, Field, Modal, PageTitle, Select, StatTile, TextInput } from "./ui";
import { SupplierModal } from "./SettingsPanel";
import { act, useMode } from "./mode-context";
import { useSettings } from "./data";

type SupplierAccount = {
  supplier: Supplier;
  /** Goods received at purchase rate */
  purchased: number;
  paid: number;
  returned: number;
  outstanding: number;
  invoices: { invoice_no: string; date: string; lines: number; value: number }[];
};

/** Purchase value per supplier = purchase rate × packs received on each batch. */
const buildAccounts = (suppliers: Supplier[], rows: BatchRow[], ledger?: LedgerData): SupplierAccount[] =>
  suppliers.map((supplier) => {
    // Transferred batches keep the supplier for traceability but are not purchases.
    const own = rows.filter((r) => r.batch.supplier_id === supplier.id && !r.batch.source_batch_id);
    const invoices = new Map<string, { invoice_no: string; date: string; lines: number; value: number }>();
    let purchased = 0;
    for (const { batch } of own) {
      const value = batch.purchase_rate * batch.qty_packs;
      purchased += value;
      const key = `${batch.invoice_no}|${batch.purchase_date}`;
      const cur = invoices.get(key) || { invoice_no: batch.invoice_no || "—", date: batch.purchase_date, lines: 0, value: 0 };
      cur.lines += 1;
      cur.value = round2(cur.value + value);
      invoices.set(key, cur);
    }
    const paid = (ledger?.payments ?? [])
      .filter((p) => p.party_type === "supplier" && p.supplier_id === supplier.id)
      .reduce((s, p) => s + p.amount, 0);
    const returned = (ledger?.purchaseReturns ?? [])
      .filter((r) => r.supplier_id === supplier.id)
      .reduce((s, r) => s + r.amount, 0);
    return {
      supplier,
      purchased: round2(purchased),
      paid: round2(paid),
      returned: round2(returned),
      outstanding: round2(purchased - paid - returned),
      invoices: [...invoices.values()].sort((a, b) => b.date.localeCompare(a.date)),
    };
  });

export const Suppliers = ({
  suppliers,
  batchRows,
  ledger,
  onChanged,
}: {
  suppliers: Supplier[];
  batchRows: BatchRow[];
  ledger?: LedgerData;
  onChanged: (message?: string) => void;
}) => {
  const mode = useMode();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const accounts = useMemo(() => buildAccounts(suppliers, batchRows, ledger), [suppliers, batchRows, ledger]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) => a.supplier.name.toLowerCase().includes(q) || a.supplier.phone.includes(q) || a.supplier.gstin.toLowerCase().includes(q),
    );
  }, [accounts, search]);

  const totals = useMemo(
    () => ({
      purchased: round2(accounts.reduce((s, a) => s + a.purchased, 0)),
      paid: round2(accounts.reduce((s, a) => s + a.paid, 0)),
      outstanding: round2(accounts.reduce((s, a) => s + Math.max(0, a.outstanding), 0)),
    }),
    [accounts],
  );

  const account = accounts.find((a) => a.supplier.id === viewing) || null;

  const exportList = () =>
    downloadExcel(
      [
        {
          name: "Suppliers",
          columns: [
            { header: "Sno", width: 6 },
            { header: "Supplier", width: 28 },
            { header: "Phone", width: 14 },
            { header: "GSTIN", width: 18 },
            { header: "Purchases (₹)", width: 14 },
            { header: "Paid (₹)", width: 12 },
            { header: "Returns (₹)", width: 12 },
            { header: "Outstanding (₹)", width: 15 },
          ],
          rows: accounts.map((a, i) => [
            i + 1,
            a.supplier.name,
            a.supplier.phone,
            a.supplier.gstin,
            a.purchased,
            a.paid,
            a.returned,
            a.outstanding,
          ]),
        },
      ],
      `${mode}-suppliers-${todayIso()}.xlsx`,
    );

  return (
    <div>
      <PageTitle
        title="Suppliers"
        subtitle={`One supplier directory for retail and wholesale — purchases, payments and balances shown are ${mode} only`}
        right={
          <>
            <Button variant="ghost" onClick={exportList}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button variant="blue" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add Supplier
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile icon={<span className="text-[17px] font-bold">₹</span>} label="Purchases (at cost)" value={money(totals.purchased)} tone="blue" />
        <StatTile icon={<span className="text-[17px] font-bold">₹</span>} label="Paid to suppliers" value={money(totals.paid)} tone="green" />
        <StatTile icon={<span className="text-[17px] font-bold">₹</span>} label="Outstanding" value={money(totals.outstanding)} tone="amber" />
      </div>

      <div className="relative mb-4 max-w-[420px]">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone or GSTIN"
          className="h-11 w-full rounded-lg border border-[#e2e6ea] bg-white pl-10 pr-3 text-[13.5px] outline-none transition placeholder:text-gray-400 focus:border-[var(--c-primary)]"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-[#f4f6f8] text-gray-700">
                <th className="th">S.No</th>
                <th className="th">Supplier</th>
                <th className="th">Phone</th>
                <th className="th">GSTIN</th>
                <th className="th text-right">Purchases</th>
                <th className="th text-right">Paid</th>
                <th className="th text-right">Returns</th>
                <th className="th text-right">Outstanding</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f3f5]">
              {filtered.map((a, index) => (
                <tr key={a.supplier.id} className="transition hover:bg-[#fafbfc]">
                  <td className="td text-gray-500">{index + 1}</td>
                  <td className="td font-medium text-gray-900">{a.supplier.name}</td>
                  <td className="td">{a.supplier.phone || "—"}</td>
                  <td className="td">{a.supplier.gstin || "—"}</td>
                  <td className="td text-right">{amount(a.purchased)}</td>
                  <td className="td text-right">{amount(a.paid)}</td>
                  <td className="td text-right">{amount(a.returned)}</td>
                  <td className={`td text-right font-semibold ${a.outstanding > 0 ? "text-amber-700" : "text-gray-500"}`}>
                    {amount(a.outstanding)}
                  </td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setViewing(a.supplier.id)}
                        aria-label="Ledger"
                        title="Ledger & payments"
                        className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[var(--c-deep)]"
                      >
                        <Receipt className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditing(a.supplier)}
                        aria-label="Edit supplier"
                        className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[var(--c-deep)]"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete ${a.supplier.name}?`)) return;
                          const res = await act(deleteSupplier(mode, a.supplier.id));
                          if (res.ok) onChanged("Supplier deleted.");
                        }}
                        aria-label="Delete supplier"
                        className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-[13.5px] text-gray-400">
                    No suppliers in the directory yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={Boolean(account)}
        onClose={() => setViewing(null)}
        title={account?.supplier.name || "Supplier"}
        subtitle="Purchase invoices, payments and returns"
        width="max-w-4xl"
      >
        {account && <SupplierLedger account={account} ledger={ledger} onChanged={onChanged} />}
      </Modal>

      <SupplierModal
        key={editing?.id || (adding ? "new" : "closed")}
        open={adding || Boolean(editing)}
        supplier={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSaved={(msg) => {
          setAdding(false);
          setEditing(null);
          onChanged(msg);
        }}
      />
    </div>
  );
};

const SupplierLedger = ({
  account,
  ledger,
  onChanged,
}: {
  account: SupplierAccount;
  ledger?: LedgerData;
  onChanged: (message?: string) => void;
}) => {
  const mode = useMode();
  const { data: settings } = useSettings();
  const methods = (settings?.mode_settings.payment_methods ?? ["Cash", "UPI", "Card"]).filter((m) => m !== "Credit");
  const [amountOut, setAmountOut] = useState("");
  const [method, setMethod] = useState<string>(methods[0] || "Cash");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  const payments = (ledger?.payments ?? []).filter((p) => p.party_type === "supplier" && p.supplier_id === account.supplier.id);
  const returns = (ledger?.purchaseReturns ?? []).filter((r) => r.supplier_id === account.supplier.id);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Purchases", account.purchased],
          ["Paid", account.paid],
          ["Returns", account.returned],
          ["Outstanding", account.outstanding],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl bg-[#fafbfc] px-4 py-3">
            <p className="text-[12px] text-gray-500">{label}</p>
            <p className="text-[17px] font-bold text-gray-900">{money(value as number)}</p>
          </div>
        ))}
      </div>

      {account.outstanding > 0 && (
        <div className="mb-5 rounded-xl border border-[#e5e7eb] p-4">
          <p className="mb-3 text-[13.5px] font-semibold text-gray-900">Record a payment</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <TextInput
              type="number"
              value={amountOut}
              onChange={(e) => setAmountOut(e.target.value)}
              placeholder={`Amount (max ${amount(account.outstanding)})`}
              className="col-span-2 md:col-span-1"
            />
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Select value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)}>
              <option value="">Against account</option>
              {account.invoices.map((i) => (
                <option key={`${i.invoice_no}-${i.date}`} value={i.invoice_no}>
                  Invoice {i.invoice_no}
                </option>
              ))}
            </Select>
            <TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ref / cheque no." />
            <TextInput type="date" value={paidOn} max={todayIso()} onChange={(e) => setPaidOn(e.target.value)} />
            <Button
              disabled={saving || !(Number(amountOut) > 0)}
              onClick={async () => {
                setSaving(true);
                const res = await act(
                  recordSupplierPayment(mode, {
                    supplier_id: account.supplier.id,
                    invoice_no: invoiceNo,
                    amount: Number(amountOut),
                    method,
                    reference,
                    paid_on: paidOn,
                  }),
                );
                setSaving(false);
                if (!res.ok) return;
                setAmountOut("");
                setReference("");
                onChanged(`Payment recorded. Balance ${money(res.data)}.`);
              }}
            >
              {saving ? "Saving…" : "Pay"}
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Field label="Purchase invoices">
          <div className="max-h-[260px] overflow-y-auto rounded-lg border border-[#e5e7eb] text-[12.5px]">
            {account.invoices.map((i) => (
              <div key={`${i.invoice_no}-${i.date}`} className="flex justify-between border-b border-[#f3f5f7] px-3 py-2 last:border-0">
                <span className="text-gray-700">
                  {dateSlash(i.date)} · {i.invoice_no} · {i.lines} line{i.lines === 1 ? "" : "s"}
                </span>
                <span className="font-semibold">{money(i.value)}</span>
              </div>
            ))}
            {!account.invoices.length && <p className="px-3 py-6 text-center text-gray-400">No purchases yet.</p>}
          </div>
        </Field>
        <Field label="Payments & returns">
          <div className="max-h-[260px] overflow-y-auto rounded-lg border border-[#e5e7eb] text-[12.5px]">
            {payments.map((p) => (
              <div key={p.id} className="flex justify-between border-b border-[#f3f5f7] px-3 py-2 last:border-0">
                <span className="text-gray-700">
                  {dateSlash(p.paid_on)} · {p.method}
                  {p.invoice_no ? ` · Inv ${p.invoice_no}` : ""}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
                <span className="font-semibold text-[var(--c-deep)]">−{money(p.amount)}</span>
              </div>
            ))}
            {returns.map((r) => (
              <div key={r.id} className="flex justify-between border-b border-[#f3f5f7] px-3 py-2 last:border-0">
                <span className="text-gray-700">
                  {dateSlash(r.created_at.slice(0, 10))} · Return {r.generic_name} ({r.qty})
                </span>
                <span className="font-semibold text-[var(--c-deep)]">−{money(r.amount)}</span>
              </div>
            ))}
            {!payments.length && !returns.length && <p className="px-3 py-6 text-center text-gray-400">Nothing yet.</p>}
          </div>
        </Field>
      </div>
    </>
  );
};
