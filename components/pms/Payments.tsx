"use client";

import React, { useMemo, useState } from "react";
import { Search, Printer, Undo2, IndianRupee, FileText, AlertTriangle, Wallet } from "lucide-react";
import type { Bill, Customer, LedgerData } from "@/lib/types";
import { amount, dateSlash, money, todayIso } from "@/lib/format";
import { round2 } from "@/lib/calc";
import { createSalesReturn, recordCustomerPayment } from "@/lib/actions";
import { Button, Card, Field, Modal, PageTitle, Pill, Select, StatTile, TextInput } from "./ui";
import { act, useMode } from "./mode-context";
import { useSettings } from "./data";

type Status = "PAID" | "PARTIAL" | "DUE" | "OVERDUE";

export const billStatus = (bill: Bill, today = todayIso()): Status => {
  if (bill.due_amount <= 0) return "PAID";
  if (bill.due_date && bill.due_date < today) return "OVERDUE";
  return bill.paid_amount > 0 ? "PARTIAL" : "DUE";
};

const STATUS_TONE: Record<Status, "green" | "blue" | "amber" | "red"> = {
  PAID: "green",
  PARTIAL: "blue",
  DUE: "amber",
  OVERDUE: "red",
};

export const Payments = ({
  bills,
  customers,
  ledger,
  onChanged,
  role,
}: {
  bills: Bill[];
  customers: Customer[];
  ledger?: LedgerData;
  onChanged: (message?: string) => void;
  role: "admin" | "staff";
}) => {
  const mode = useMode();
  const [tab, setTab] = useState<"invoices" | "payments" | "returns">("invoices");
  const [status, setStatus] = useState<"ALL" | Status | "OPEN">("ALL");
  const [search, setSearch] = useState("");
  const [paying, setPaying] = useState<Bill | null>(null);
  const [returning, setReturning] = useState<Bill | null>(null);

  const today = todayIso();
  const stats = useMemo(() => {
    let invoiced = 0;
    let received = 0;
    let outstanding = 0;
    let overdue = 0;
    for (const b of bills) {
      invoiced += b.grand_total;
      received += b.paid_amount;
      outstanding += b.due_amount;
      if (billStatus(b, today) === "OVERDUE") overdue += b.due_amount;
    }
    const refunds = (ledger?.salesReturns ?? []).reduce((s, r) => s + r.refund_amount, 0);
    return {
      invoiced: round2(invoiced),
      received: round2(received),
      outstanding: round2(outstanding),
      overdue: round2(overdue),
      refunds: round2(refunds),
    };
  }, [bills, ledger, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bills.filter((b) => {
      const st = billStatus(b, today);
      if (status === "OPEN" && st === "PAID") return false;
      if (status !== "ALL" && status !== "OPEN" && st !== status) return false;
      if (!q) return true;
      return (
        b.id.toLowerCase().includes(q) ||
        b.customer_name.toLowerCase().includes(q) ||
        b.customer_phone.includes(q) ||
        (b.customer_id || "").toLowerCase().includes(q)
      );
    });
  }, [bills, status, search, today]);

  const customerName = (id: string | null) => customers.find((c) => c.id === id)?.name || "—";

  return (
    <div>
      <PageTitle
        title="Invoices & Payments"
        subtitle={`${mode === "wholesale" ? "Wholesale" : "Retail"} invoices, receipts, outstanding balances and returns`}
        right={
          <div className="flex overflow-hidden rounded-lg border border-[#d8dde3]">
            {(
              [
                ["invoices", "Invoices"],
                ["payments", "Receipts"],
                ["returns", "Returns"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`cursor-pointer px-4 py-2 text-[13px] font-semibold transition ${
                  tab === key ? "bg-[var(--c-deep)] text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <StatTile icon={<FileText className="h-5 w-5" />} label="Invoiced" value={money(stats.invoiced)} tone="blue" />
        <StatTile icon={<IndianRupee className="h-5 w-5" />} label="Received" value={money(stats.received)} tone="green" />
        <StatTile icon={<Wallet className="h-5 w-5" />} label="Outstanding" value={money(stats.outstanding)} tone="amber" />
        <StatTile icon={<AlertTriangle className="h-5 w-5" />} label="Overdue" value={money(stats.overdue)} tone="red" />
        <StatTile icon={<Undo2 className="h-5 w-5" />} label="Refunded on returns" value={money(stats.refunds)} tone="gray" />
      </div>

      {tab === "invoices" && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="Status" className="w-[170px]">
              <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="ALL">All invoices</option>
                <option value="OPEN">Unpaid (any)</option>
                <option value="DUE">Due</option>
                <option value="PARTIAL">Part paid</option>
                <option value="OVERDUE">Overdue</option>
                <option value="PAID">Paid</option>
              </Select>
            </Field>
            <Field label="Search" className="min-w-[240px] flex-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <TextInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Invoice no, customer, phone or customer ID"
                  className="pl-10"
                />
              </div>
            </Field>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead>
                  <tr className="bg-[#f4f6f8] text-gray-700">
                    <th className="th">Invoice</th>
                    <th className="th">Date</th>
                    <th className="th">{mode === "wholesale" ? "Pharmacy Name" : "Customer"}</th>
                    <th className="th">Payment</th>
                    <th className="th text-right">Total</th>
                    <th className="th text-right">Paid</th>
                    <th className="th text-right">Due</th>
                    <th className="th">Due date</th>
                    <th className="th">Status</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f5]">
                  {filtered.map((bill) => {
                    const st = billStatus(bill, today);
                    const returnable = bill.items.some((i) => i.qty - i.returned_qty > 0);
                    return (
                      <tr key={bill.id} className="transition hover:bg-[#fafbfc]">
                        <td className="td font-semibold text-gray-900">{bill.id}</td>
                        <td className="td">{dateSlash(bill.bill_date)}</td>
                        <td className="td">{bill.customer_name || "Walk-in Customer"}</td>
                        <td className="td">{bill.payment_method}</td>
                        <td className="td text-right font-semibold">{amount(bill.grand_total)}</td>
                        <td className="td text-right">{amount(bill.paid_amount)}</td>
                        <td className={`td text-right font-semibold ${bill.due_amount > 0 ? "text-amber-700" : "text-gray-400"}`}>
                          {amount(bill.due_amount)}
                        </td>
                        <td className="td">{bill.due_date ? dateSlash(bill.due_date) : "—"}</td>
                        <td className="td">
                          <Pill tone={STATUS_TONE[st]}>{st === "PARTIAL" ? "PART PAID" : st}</Pill>
                          {bill.returned_amount > 0 && (
                            <span className="ml-1.5">
                              <Pill tone="gray">RETURN</Pill>
                            </span>
                          )}
                        </td>
                        <td className="td">
                          <div className="flex items-center justify-end gap-1.5">
                            {bill.due_amount > 0 && bill.customer_id && (
                              <button
                                onClick={() => setPaying(bill)}
                                className="cursor-pointer rounded-md border border-[#d8dde3] px-2.5 py-1 text-[12px] font-semibold text-[var(--c-deep)] hover:bg-gray-50"
                              >
                                Receive
                              </button>
                            )}
                            {returnable && (
                              <button
                                onClick={() => setReturning(bill)}
                                aria-label="Return items"
                                title="Sales return"
                                className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[var(--c-deep)]"
                              >
                                <Undo2 className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => window.open(`/invoice/${encodeURIComponent(bill.id)}`, "_blank")}
                              aria-label="Print invoice"
                              title="Print / PDF"
                              className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[var(--c-deep)]"
                            >
                              <Printer className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={10} className="px-4 py-16 text-center text-[13.5px] text-gray-400">
                        No invoices match.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {tab === "payments" && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="bg-[#f4f6f8] text-gray-700">
                  <th className="th">Date</th>
                  <th className="th">{mode === "wholesale" ? "Pharmacy Name" : "Customer"}</th>
                  <th className="th">Invoice</th>
                  <th className="th">Method</th>
                  <th className="th">Reference</th>
                  <th className="th text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f3f5]">
                {(ledger?.payments ?? [])
                  .filter((p) => p.party_type === "customer")
                  .map((p) => (
                    <tr key={p.id}>
                      <td className="td">{dateSlash(p.paid_on)}</td>
                      <td className="td">{customerName(p.customer_id)}</td>
                      <td className="td">{p.bill_id || "—"}</td>
                      <td className="td">{p.method}</td>
                      <td className="td">{p.reference || p.note || "—"}</td>
                      <td className="td text-right font-semibold">{amount(p.amount)}</td>
                    </tr>
                  ))}
                {!(ledger?.payments ?? []).some((p) => p.party_type === "customer") && (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-[13.5px] text-gray-400">
                      No receipts against credit bills yet. Bills paid in full at the counter don&rsquo;t appear here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "returns" && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="bg-[#f4f6f8] text-gray-700">
                  <th className="th">Date</th>
                  <th className="th">Invoice</th>
                  <th className="th">Items</th>
                  <th className="th text-right">Value</th>
                  <th className="th text-right">Set off against due</th>
                  <th className="th text-right">Refunded</th>
                  <th className="th">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f3f5]">
                {(ledger?.salesReturns ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="td">{dateSlash(r.created_at.slice(0, 10))}</td>
                    <td className="td font-semibold">{r.bill_id}</td>
                    <td className="td text-[12.5px] text-gray-600">
                      {r.items.map((i) => `${i.generic_name} × ${i.qty}`).join(", ")}
                    </td>
                    <td className="td text-right font-semibold">{amount(r.amount)}</td>
                    <td className="td text-right">{amount(r.adjusted_against_due)}</td>
                    <td className="td text-right">
                      {amount(r.refund_amount)} <span className="text-[11px] text-gray-500">{r.refund_method}</span>
                    </td>
                    <td className="td text-[12.5px] text-gray-600">{r.reason || "—"}</td>
                  </tr>
                ))}
                {!(ledger?.salesReturns ?? []).length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-[13.5px] text-gray-400">
                      No returns recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ReceiveModal key={paying?.id || "no-pay"} bill={paying} onClose={() => setPaying(null)} onDone={(m) => { setPaying(null); onChanged(m); }} />
      <ReturnModal
        key={returning?.id || "no-return"}
        bill={returning}
        role={role}
        onClose={() => setReturning(null)}
        onDone={(m) => {
          setReturning(null);
          onChanged(m);
        }}
      />
    </div>
  );
};

const ReceiveModal = ({ bill, onClose, onDone }: { bill: Bill | null; onClose: () => void; onDone: (message: string) => void }) => {
  const mode = useMode();
  const { data: settings } = useSettings();
  const methods = (settings?.mode_settings.payment_methods ?? ["Cash", "UPI", "Card"]).filter((m) => m !== "Credit");
  const [value, setValue] = useState(bill ? String(bill.due_amount) : "");
  const [method, setMethod] = useState<string>(methods[0] || "Cash");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  if (!bill || !bill.customer_id) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Receive payment — ${bill.id}`}
      subtitle={`${bill.customer_name} · due ${money(bill.due_amount)}`}
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || !(Number(value) > 0)}
            onClick={async () => {
              setSaving(true);
              const res = await act(
                recordCustomerPayment(mode, {
                  customer_id: bill.customer_id!,
                  bill_id: bill.id,
                  amount: Number(value),
                  method,
                  reference,
                  paid_on: paidOn,
                }),
              );
              setSaving(false);
              if (res.ok) onDone(`Received ${money(Number(value))} against ${bill.id}.`);
            }}
          >
            {saving ? "Saving…" : "Save receipt"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Amount (₹)">
          <TextInput type="number" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {methods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference / cheque no.">
          <TextInput value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Date">
          <TextInput type="date" value={paidOn} max={todayIso()} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};

const ReturnModal = ({
  bill,
  onClose,
  onDone,
}: {
  bill: Bill | null;
  role: "admin" | "staff";
  onClose: () => void;
  onDone: (message: string) => void;
}) => {
  const mode = useMode();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [refundMethod, setRefundMethod] = useState("Cash");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  if (!bill) return null;

  const linesTotal = bill.items.reduce((s, i) => s + i.line_amount, 0);
  const factor = linesTotal > 0 ? bill.grand_total / linesTotal : 1;
  const value = round2(
    bill.items.reduce((s, i) => s + i.per_unit_price * (Math.floor(Number(qty[i.id]) || 0)) * factor, 0),
  );
  const setOff = Math.min(bill.due_amount, value);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Sales return — ${bill.id}`}
      subtitle="Returned units go back into the batch they were sold from"
      width="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || value <= 0}
            onClick={async () => {
              setSaving(true);
              const res = await act(
                createSalesReturn(mode, {
                  bill_id: bill.id,
                  items: bill.items.map((i) => ({ bill_item_id: i.id, qty: Math.floor(Number(qty[i.id]) || 0) })),
                  refund_method: refundMethod,
                  reason,
                }),
              );
              setSaving(false);
              if (res.ok) {
                onDone(
                  `Return saved — ${money(res.data.amount)}${res.data.refund > 0 ? `, refund ${money(res.data.refund)}` : ""}. Revised bill opened.`,
                );
                // The invoice now lists the return and the revised net amount — open it to print / send.
                const url = `/invoice/${encodeURIComponent(bill.id)}`;
                // iPhone blocks new tabs opened after an await — fall back to this tab.
                if (!window.open(url, "_blank")) window.location.href = url;
              }
            }}
          >
            {saving ? "Saving…" : "Save return"}
          </Button>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="bg-[#f4f6f8] text-gray-700">
              <th className="th">Product</th>
              <th className="th">Batch</th>
              <th className="th text-right">Rate (₹)</th>
              <th className="th text-right">Qty bought</th>
              <th className="th text-right">Amount paid (₹)</th>
              <th className="th text-right">Already returned</th>
              <th className="th text-right">Return now</th>
              <th className="th text-right">Return value (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f3f5]">
            {bill.items.map((i) => {
              const left = i.qty - i.returned_qty;
              const now = Math.floor(Number(qty[i.id]) || 0);
              return (
                <tr key={i.id}>
                  <td className="td">
                    <p className="font-semibold text-gray-900">{i.generic_name}</p>
                    {i.product_type && <p className="text-[11px] text-gray-500">{i.product_type}</p>}
                  </td>
                  <td className="td">{i.batch_no}</td>
                  <td className="td text-right">{amount(round2(i.per_unit_price * factor))}</td>
                  <td className="td text-right">{i.qty}</td>
                  <td className="td text-right font-semibold">{amount(round2(i.line_amount * factor))}</td>
                  <td className="td text-right">{i.returned_qty || "—"}</td>
                  <td className="td text-right">
                    <input
                      type="number"
                      min={0}
                      max={left}
                      disabled={left <= 0}
                      value={qty[i.id] ?? ""}
                      onChange={(e) =>
                        setQty({ ...qty, [i.id]: String(Math.min(left, Math.max(0, Math.floor(Number(e.target.value) || 0)))) })
                      }
                      className="h-8 w-[70px] rounded-md border border-[#e3e7ea] text-center text-[12.5px] font-bold outline-none focus:border-[var(--c-primary)] disabled:bg-gray-50"
                    />
                  </td>
                  <td className="td text-right font-semibold text-[var(--c-deep)]">
                    {now > 0 ? amount(round2(i.per_unit_price * now * factor)) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Refund method">
          <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
            {["Cash", "UPI", "Card", "Bank Transfer", "Credit note"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reason" className="sm:col-span-2">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      <p className="mt-3 text-[13px] text-gray-700">
        Bill total <b>{money(bill.grand_total)}</b>
        {bill.returned_amount > 0 && <> · returned earlier {money(bill.returned_amount)}</>} · this return{" "}
        <b>{money(value)}</b> · revised bill{" "}
        <b>{money(round2(Math.max(0, bill.grand_total - bill.returned_amount - value)))}</b>
      </p>
      <p className="mt-1 text-[13px] text-gray-700">
        Return value <b>{money(value)}</b>
        {setOff > 0 && (
          <>
            {" "}
            · {money(setOff)} set off against the amount due · refund <b>{money(round2(value - setOff))}</b>
          </>
        )}
      </p>
    </Modal>
  );
};
