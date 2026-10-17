"use client";

import React, { useMemo, useState } from "react";
import { Search, Download, Plus, Pencil, Trash2, Receipt, Phone, MapPin } from "lucide-react";
import type { Bill, Customer, LedgerData } from "@/lib/types";
import { amount, dateSlash, money, todayIso } from "@/lib/format";
import { deleteCustomer, recordCustomerPayment, saveCustomer } from "@/lib/actions";
import { act, useMode } from "./mode-context";
import { useSettings } from "./data";
import { CUSTOMERS_SHEET } from "./exports";
import { downloadExcel } from "@/lib/xlsx";
import { Button, Card, Field, Modal, PageTitle, Pill, Select, TextInput } from "./ui";

export const BUSINESS_TYPES = ["Retailer", "Medical Shop", "Clinic", "Hospital", "Distributor", "Other"];

export const Customers = ({
  customers,
  bills,
  ledger,
  onChanged,
  role,
}: {
  customers: Customer[];
  bills: Bill[];
  ledger?: LedgerData;
  onChanged: (message?: string) => void;
  role: "admin" | "staff";
}) => {
  const mode = useMode();
  const wholesale = mode === "wholesale";
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [adding, setAdding] = useState(false);

  const enriched = useMemo(() => {
    return customers.map((customer) => {
      const own = bills.filter(
        (b) => b.customer_id === customer.id || (customer.phone && b.customer_phone === customer.phone),
      );
      return {
        customer,
        bills: own,
        spend: own.reduce((sum, b) => sum + b.grand_total, 0),
        due: own.reduce((sum, b) => sum + b.due_amount, 0),
        last: own[0]?.bill_date || "",
      };
    });
  }, [customers, bills]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter(
      ({ customer }) =>
        customer.name.toLowerCase().includes(q) ||
        customer.phone.includes(q) ||
        customer.id.toLowerCase().includes(q) ||
        customer.gstin.toLowerCase().includes(q),
    );
  }, [enriched, search]);

  const selectedHistory = useMemo(() => {
    if (!selected) return [];
    return bills.filter(
      (b) => b.customer_id === selected.id || (selected.phone && b.customer_phone === selected.phone),
    );
  }, [selected, bills]);

  const handleExport = () => {
    downloadExcel(
      [
        CUSTOMERS_SHEET(
          enriched.map(({ customer, bills: own, spend, last }) => ({
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            address: customer.address,
            doctor: customer.doctor_name,
            bills: own.length,
            spend: Number(spend.toFixed(2)),
            last,
          })),
        ),
      ],
      `customers-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  return (
    <div>
      <PageTitle
        title={wholesale ? "Customers & Distributors" : "Customers"}
        subtitle={
          wholesale
            ? "Retailers, medical shops, clinics, hospitals and distributors — terms, credit and balances"
            : "Name, phone and purchase history"
        }
        right={
          <>
            <Button variant="ghost" onClick={handleExport}>
              <Download className="h-4 w-4" /> Export
            </Button>
            {role === "admin" && (
              <Button variant="blue" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" /> Add Customer
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 relative max-w-[420px]">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer ID, name or phone"
          className="h-11 w-full rounded-lg border border-[#e2e6ea] bg-white pl-10 pr-3 text-[13.5px] outline-none transition placeholder:text-gray-400 focus:border-[var(--c-primary)]"
        />
      </div>

      {/* Desktop / tablet table */}
      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="bg-[#f4f6f8] text-gray-700">
                <th className="th">S.No</th>
                <th className="th">Customer ID</th>
                <th className="th">Name</th>
                <th className="th">Phone</th>
                <th className="th">Address</th>
                <th className="th">{wholesale ? "Type" : "Doctor"}</th>
                <th className="th">{wholesale ? "GSTIN" : "Email"}</th>
                <th className="th">{wholesale ? "Terms" : "Age / Gender"}</th>
                <th className="th text-center">Bills</th>
                <th className="th text-right">Total Purchase</th>
                <th className="th text-right">Outstanding</th>
                <th className="th">Last Purchase</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f3f5]">
              {filtered.map(({ customer, bills: own, spend, due, last }, index) => (
                <tr key={customer.id} className="transition hover:bg-[#fafbfc]">
                  <td className="td text-gray-500">{index + 1}</td>
                  <td className="td font-semibold text-[#1f6feb]">{customer.id}</td>
                  <td className="td font-medium text-gray-900">
                    {customer.name || "—"}
                    {customer.quick_bill && (
                      <span className="ml-2">
                        <Pill tone="green">QUICK BILL</Pill>
                      </span>
                    )}
                  </td>
                  <td className="td">{customer.phone || "—"}</td>
                  <td className="td max-w-[220px] truncate">{customer.address || "—"}</td>
                  <td className="td">{(wholesale ? customer.business_type : customer.doctor_name) || "—"}</td>
                  <td className="td max-w-[180px] truncate">{(wholesale ? customer.gstin : customer.email) || "—"}</td>
                  <td className="td">
                    {wholesale
                      ? [
                          customer.credit_days ? `${customer.credit_days} days` : "",
                          customer.discount_percent ? `${customer.discount_percent}% off` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"
                      : [customer.age, customer.gender].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td className="td text-center">{own.length}</td>
                  <td className="td text-right font-semibold">{amount(spend)}</td>
                  <td className={`td text-right font-semibold ${due > 0 ? "text-amber-700" : "text-gray-400"}`}>
                    {amount(due)}
                  </td>
                  <td className="td">{last ? dateSlash(last) : "—"}</td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setSelected(customer)}
                        aria-label="Purchase history"
                        className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[var(--c-deep)]"
                      >
                        <Receipt className="h-4 w-4" />
                      </button>
                      {role === "admin" && (
                        <>
                          <button
                            onClick={() => setEditing(customer)}
                            aria-label="Edit"
                            className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[var(--c-deep)]"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm(`Delete customer ${customer.name || customer.id}?`)) {
                                const res = await act(deleteCustomer(mode, customer.id));
                                if (res.ok) onChanged("Customer deleted.");
                              }
                            }}
                            aria-label="Delete"
                            className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={13} className="px-4 py-16 text-center text-[13.5px] text-gray-400">
                    No customers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile card list */}
      <div className="space-y-3 md:hidden">
        {filtered.map(({ customer, bills: own, spend, due, last }, index) => (
          <Card key={customer.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[11.5px] font-semibold text-gray-400">
                  <span>#{index + 1}</span>
                  <span className="font-bold text-[#1f6feb]">{customer.id}</span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[15px] font-bold text-gray-900">
                  {customer.name || "—"}
                  {customer.quick_bill && <Pill tone="green">QUICK BILL</Pill>}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-gray-600">
                  <Phone className="h-3.5 w-3.5 text-gray-400" />
                  {customer.phone || "—"}
                </p>
                {customer.address && (
                  <p className="mt-1 flex items-start gap-1.5 text-[12.5px] leading-snug text-gray-600">
                    <MapPin className="mt-[2px] h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="break-words">{customer.address}</span>
                  </p>
                )}
                {customer.doctor_name && (
                  <p className="mt-1 text-[12.5px] text-gray-600">
                    <span className="text-gray-400">Doctor:</span> {customer.doctor_name}
                  </p>
                )}
                {customer.gstin && (
                  <p className="mt-1 text-[12.5px] text-gray-600">
                    <span className="text-gray-400">GSTIN:</span> {customer.gstin}
                  </p>
                )}
                {due > 0 && (
                  <p className="mt-1 text-[12.5px] font-semibold text-amber-700">Outstanding ₹{amount(due)}</p>
                )}
                {customer.email && (
                  <p className="mt-1 break-words text-[12.5px] text-gray-600">
                    <span className="text-gray-400">Email:</span> {customer.email}
                  </p>
                )}
                {(customer.age || customer.gender) && (
                  <p className="mt-1 text-[12.5px] text-gray-600">
                    <span className="text-gray-400">Age / Gender:</span>{" "}
                    {[customer.age, customer.gender].filter(Boolean).join(" / ")}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <button
                  onClick={() => setSelected(customer)}
                  aria-label="Purchase history"
                  className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[var(--c-deep)]"
                >
                  <Receipt className="h-4 w-4" />
                </button>
                {role === "admin" && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditing(customer)}
                      aria-label="Edit"
                      className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[var(--c-deep)]"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm(`Delete customer ${customer.name || customer.id}?`)) {
                          const res = await act(deleteCustomer(mode, customer.id));
                          if (res.ok) onChanged("Customer deleted.");
                        }
                      }}
                      aria-label="Delete"
                      className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#eef1f3] pt-3 text-center">
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                  Bills
                </p>
                <p className="mt-0.5 text-[14px] font-bold text-gray-900">{own.length}</p>
              </div>
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                  Total
                </p>
                <p className="mt-0.5 text-[14px] font-bold text-[var(--c-deep)]">₹{amount(spend)}</p>
              </div>
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                  Last
                </p>
                <p className="mt-0.5 text-[12.5px] font-semibold text-gray-700">
                  {last ? dateSlash(last) : "—"}
                </p>
              </div>
            </div>
          </Card>
        ))}
        {!filtered.length && (
          <Card className="py-14 text-center text-[13.5px] text-gray-400">No customers found.</Card>
        )}
      </div>

      {/* Purchase history */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name || "Customer"}
        subtitle={`${selected?.id || ""} · Purchase history`}
        width="max-w-4xl"
      >
        {selected && (
          <>
            <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 rounded-xl bg-[#fafbfc] px-4 py-3 text-[13px] text-gray-700">
              <span className="flex items-center gap-1.5">
                <Phone className="h-4 w-4 text-gray-400" /> {selected.phone || "—"}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-gray-400" /> {selected.address || "—"}
              </span>
              <span className="ml-auto font-semibold text-[var(--c-deep)]">
                {selectedHistory.length} bills ·{" "}
                {money(selectedHistory.reduce((sum, b) => sum + b.grand_total, 0))}
              </span>
            </div>

            <ReceivePayment
              customer={selected}
              bills={selectedHistory}
              payments={(ledger?.payments ?? []).filter((p) => p.customer_id === selected.id)}
              onDone={(message) => onChanged(message)}
            />

            <div className="max-h-[430px] overflow-y-auto">
              {selectedHistory.map((bill) => (
                <div key={bill.id} className="mb-3 rounded-xl border border-[#e5e7eb]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f1f3f5] px-4 py-2.5">
                    <span className="text-[13px] font-bold text-gray-900">{bill.id}</span>
                    <span className="text-[12.5px] text-gray-500">{dateSlash(bill.bill_date)}</span>
                    {bill.due_amount > 0 && (
                      <Pill tone="amber">Due {money(bill.due_amount)}</Pill>
                    )}
                    <span className="text-[13px] font-bold text-[var(--c-deep)]">
                      {money(bill.grand_total)}
                    </span>
                  </div>
                  <table className="w-full">
                    <tbody className="divide-y divide-[#f4f6f8]">
                      {bill.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2 text-[12.5px] text-gray-800">
                            {item.generic_name}
                            <span className="ml-1.5 text-[11px] text-gray-500">
                              {item.brand_name} · Box {item.box || "-"}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-[12.5px] text-gray-600">
                            {item.qty} × {amount(item.per_unit_price)}
                          </td>
                          <td className="px-4 py-2 text-right text-[12.5px] font-semibold text-gray-900">
                            {amount(item.line_amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {!selectedHistory.length && (
                <p className="py-14 text-center text-[13.5px] text-gray-400">
                  No purchases recorded for this customer yet.
                </p>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* Add / edit */}
      <CustomerFormModal
        key={editing?.id || (adding ? "new" : "closed")}
        open={adding || Boolean(editing)}
        customer={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSaved={(message) => {
          setAdding(false);
          setEditing(null);
          onChanged(message);
        }}
      />
    </div>
  );
};

const CustomerFormModal = ({
  open,
  customer,
  onClose,
  onSaved,
}: {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) => {
  const mode = useMode();
  const wholesale = mode === "wholesale";
  // Keyed at the call site, so the draft is seeded once on mount.
  const [draft, setDraft] = useState({
    business_type: customer?.business_type || "",
    gstin: customer?.gstin || "",
    shipping_address: customer?.shipping_address || "",
    credit_limit: customer?.credit_limit ? String(customer.credit_limit) : "",
    credit_days: customer?.credit_days ? String(customer.credit_days) : "",
    discount_percent: customer?.discount_percent ? String(customer.discount_percent) : "",
    name: customer?.name || "",
    phone: customer?.phone || "",
    address: customer?.address || "",
    doctor_name: customer?.doctor_name || "",
    email: customer?.email || "",
    age: customer?.age || "",
    gender: customer?.gender || "",
    quick_bill: customer?.quick_bill || false,
  });

  if (!open) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={customer ? "Edit Customer" : "Add Customer"}
      subtitle={
        customer
          ? customer.id
          : `A customer ID (${wholesale ? "NCW000001" : "NCM000001"}) is generated automatically`
      }
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (!draft.name.trim() && !draft.phone.trim()) return;
              const res = await act(saveCustomer(mode, { id: customer?.id, ...draft }));
              if (res.ok) onSaved(customer ? "Customer updated." : "Customer added.");
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={wholesale ? "Business Name" : "Customer Name"}>
          <TextInput
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={wholesale ? "Enter business name" : "Enter customer name"}
          />
        </Field>
        <Field label="Phone Number">
          <TextInput
            value={draft.phone}
            inputMode="numeric"
            onChange={(e) =>
              setDraft({ ...draft, phone: e.target.value.replace(/[^\d]/g, "").slice(0, 10) })
            }
            placeholder="Enter mobile number"
          />
        </Field>
        <Field label={wholesale ? "Billing Address" : "Address"} className="sm:col-span-2">
          <TextInput
            value={draft.address}
            onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            placeholder="Enter address"
          />
        </Field>
        {wholesale && (
          <>
            <Field label="Shipping Address" className="sm:col-span-2">
              <TextInput
                value={draft.shipping_address}
                onChange={(e) => setDraft({ ...draft, shipping_address: e.target.value })}
                placeholder="Same as billing if blank"
              />
            </Field>
            <Field label="Business Type">
              <Select value={draft.business_type} onChange={(e) => setDraft({ ...draft, business_type: e.target.value })}>
                <option value="">Select</option>
                {BUSINESS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="GSTIN">
              <TextInput
                value={draft.gstin}
                onChange={(e) => setDraft({ ...draft, gstin: e.target.value.toUpperCase().slice(0, 15) })}
                placeholder="15-character GSTIN"
              />
            </Field>
            <Field label="Customer Discount %" hint="Taken off the wholesale price on every bill">
              <TextInput
                type="number"
                value={draft.discount_percent}
                onChange={(e) => setDraft({ ...draft, discount_percent: e.target.value })}
                placeholder="0"
              />
            </Field>
            <Field label="Credit Period (days)" hint="Blank = dashboard default">
              <TextInput
                type="number"
                value={draft.credit_days}
                onChange={(e) => setDraft({ ...draft, credit_days: e.target.value })}
                placeholder="30"
              />
            </Field>
          </>
        )}
        <Field label="Credit Limit (₹)" hint="Blank = no limit on credit bills">
          <TextInput
            type="number"
            value={draft.credit_limit}
            onChange={(e) => setDraft({ ...draft, credit_limit: e.target.value })}
            placeholder="0"
          />
        </Field>
        {!wholesale && (
        <Field label="Doctor Name">
          <TextInput
            value={draft.doctor_name}
            onChange={(e) => setDraft({ ...draft, doctor_name: e.target.value })}
            placeholder="Enter doctor name"
          />
        </Field>
        )}
        <Field label="Email">
          <TextInput
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            placeholder="Enter email"
          />
        </Field>
        {!wholesale && (
        <>
        <Field label="Age">
          <TextInput
            value={draft.age}
            inputMode="numeric"
            onChange={(e) => setDraft({ ...draft, age: e.target.value.replace(/[^\d]/g, "").slice(0, 3) })}
            placeholder="Enter age"
          />
        </Field>
        <Field label="Gender">
          <Select value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value })}>
            <option value="">Select</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="O">Other</option>
          </Select>
        </Field>
        </>
        )}
        <label className="flex cursor-pointer items-end gap-2.5 pb-2.5 text-[13.5px] font-medium text-gray-800">
          <input
            type="checkbox"
            checked={draft.quick_bill}
            onChange={(e) => setDraft({ ...draft, quick_bill: e.target.checked })}
            className="h-4 w-4 cursor-pointer accent-[var(--c-deep)]"
          />
          Register for Quick Bill
        </label>
      </div>
    </Modal>
  );
};

/* --------------------------- receive a payment --------------------------- */

const ReceivePayment = ({
  customer,
  bills,
  payments,
  onDone,
}: {
  customer: Customer;
  bills: Bill[];
  payments: import("@/lib/types").Payment[];
  onDone: (message: string) => void;
}) => {
  const mode = useMode();
  const { data: settings } = useSettings();
  const methods = (settings?.mode_settings.payment_methods ?? ["Cash", "UPI", "Card"]).filter((m) => m !== "Credit");
  const due = bills.reduce((s, b) => s + b.due_amount, 0);
  const [amountIn, setAmountIn] = useState("");
  const [method, setMethod] = useState<string>(methods[0] || "Cash");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  if (due <= 0 && !payments.length) return null;

  return (
    <div className="mb-4 rounded-xl border border-[#e5e7eb] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13.5px] font-semibold text-gray-900">Account</p>
        <p className="text-[13px]">
          Outstanding: <b className={due > 0 ? "text-amber-700" : "text-gray-900"}>{money(due)}</b>
        </p>
      </div>
      {due > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <TextInput
            type="number"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
            placeholder={`Amount (max ${amount(due)})`}
            className="col-span-2 sm:col-span-1"
          />
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {methods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ref / cheque no." />
          <TextInput type="date" value={paidOn} max={todayIso()} onChange={(e) => setPaidOn(e.target.value)} />
          <Button
            disabled={saving || !(Number(amountIn) > 0)}
            onClick={async () => {
              setSaving(true);
              const res = await act(
                recordCustomerPayment(mode, {
                  customer_id: customer.id,
                  amount: Number(amountIn),
                  method,
                  reference,
                  paid_on: paidOn,
                }),
              );
              setSaving(false);
              if (!res.ok) return;
              setAmountIn("");
              setReference("");
              onDone(`Payment of ${money(Number(amountIn))} recorded. Balance ${money(res.data)}.`);
            }}
          >
            {saving ? "Saving…" : "Receive"}
          </Button>
        </div>
      )}
      {payments.length > 0 && (
        <div className="mt-3 max-h-[140px] overflow-y-auto text-[12.5px]">
          {payments.map((p) => (
            <div key={p.id} className="flex justify-between border-b border-[#f3f5f7] py-1.5 last:border-0">
              <span className="text-gray-600">
                {dateSlash(p.paid_on)} · {p.method}
                {p.bill_id ? ` · Bill ${p.bill_id}` : ""}
                {p.reference ? ` · ${p.reference}` : ""}
              </span>
              <span className="font-semibold text-gray-900">{money(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-gray-500">Receipts settle the oldest outstanding bills first.</p>
    </div>
  );
};
