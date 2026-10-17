"use client";

import React, { useMemo, useState } from "react";
import { Save, Plus, Trash2, GitMerge, Pencil } from "lucide-react";
import type { DiscountTier, ModeSettings, PaymentMethod } from "@/lib/types";
import { MODE_LABEL, type Mode } from "@/lib/mode";
import { amount, monthShort } from "@/lib/format";
import { classifyLegacyRecords, deleteUser, listUsers, saveModeSettings, saveUser, type AppUser } from "@/lib/actions";
import { Button, Card, Field, Modal, Pill, Select, TextInput } from "./ui";
import { act, useMode, useModeState } from "./mode-context";
import { useReconciliation } from "./data";

const ALL_METHODS: PaymentMethod[] = ["Cash", "UPI", "Card", "Bank Transfer", "Cheque"];
type Draft = {
  invoice_prefix: string;
  payment_methods: PaymentMethod[];
  allow_credit: boolean;
  default_credit_days: string;
  low_stock_threshold: string;
  expiry_alert_months: string;
  max_discount_percent: string;
  enforce_moq: boolean;
  invoice_terms: string;
};

/* ------------------------------------------------------------------------
   Per-dashboard settings: invoice numbering, payments, pricing, alerts.
   ------------------------------------------------------------------------ */

export const ModeSettingsCard = ({
  settings,
  onChanged,
}: {
  settings: ModeSettings;
  onChanged: (message?: string) => void;
}) => {
  const mode = useMode();
  const wholesale = mode === "wholesale";
  const [draft, setDraft] = useState<Draft>(() => ({
    invoice_prefix: settings.invoice_prefix,
    payment_methods: settings.payment_methods.filter((m) => m !== "Credit"),
    allow_credit: settings.allow_credit,
    default_credit_days: String(settings.default_credit_days || ""),
    low_stock_threshold: String(settings.low_stock_threshold || ""),
    expiry_alert_months: String(settings.expiry_alert_months || ""),
    max_discount_percent: String(settings.max_discount_percent || ""),
    enforce_moq: settings.enforce_moq,
    invoice_terms: settings.invoice_terms,
  }));
  const [tiers, setTiers] = useState<DiscountTier[]>(settings.bulk_discount_tiers);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const toggleMethod = (m: PaymentMethod) =>
    set({
      payment_methods: draft.payment_methods.includes(m)
        ? draft.payment_methods.filter((x) => x !== m)
        : [...draft.payment_methods, m],
    });

  const save = async () => {
    setSaving(true);
    const res = await act(
      saveModeSettings(mode, {
        ...draft,
        payment_methods: draft.allow_credit ? [...draft.payment_methods, "Credit"] : draft.payment_methods,
        bulk_discount_tiers: tiers,
      }),
    );
    setSaving(false);
    if (res.ok) onChanged(`${MODE_LABEL[mode]} settings saved.`);
  };

  return (
    <Card className="mt-4 p-5">
      <h3 className="mb-1 text-[15px] font-bold text-gray-900">{MODE_LABEL[mode]} Settings</h3>
      <p className="mb-4 text-[12px] text-gray-500">
        These apply to the {mode} dashboard only. The other dashboard keeps its own.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field
          label="Invoice number prefix"
          hint={`Next invoice looks like ${draft.invoice_prefix || ""}123. Must differ from the other dashboard.`}
        >
          <TextInput
            value={draft.invoice_prefix}
            onChange={(e) => set({ invoice_prefix: e.target.value.toUpperCase().slice(0, 8) })}
            placeholder={wholesale ? "W" : "(none)"}
          />
        </Field>
        <Field label="Low stock threshold" hint="Blank = each medicine's own threshold">
          <TextInput
            type="number"
            value={draft.low_stock_threshold}
            onChange={(e) => set({ low_stock_threshold: e.target.value })}
          />
        </Field>
        <Field label="Expiry alert (months)" hint="Blank = shop-wide setting">
          <TextInput
            type="number"
            value={draft.expiry_alert_months}
            onChange={(e) => set({ expiry_alert_months: e.target.value })}
          />
        </Field>
        <Field label="Max extra discount %" hint="Cap on the manual bill discount. Blank = no cap">
          <TextInput
            type="number"
            value={draft.max_discount_percent}
            onChange={(e) => set({ max_discount_percent: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Field label="Payment methods">
          <div className="flex flex-wrap gap-2">
            {ALL_METHODS.map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium ${
                  draft.payment_methods.includes(m) ? "border-[var(--c-primary)] bg-[var(--c-mint)]" : "border-[#e5e7eb]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={draft.payment_methods.includes(m)}
                  onChange={() => toggleMethod(m)}
                  className="h-4 w-4 accent-[var(--c-primary)]"
                />
                {m}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Credit sales">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-gray-800">
              <input
                type="checkbox"
                checked={draft.allow_credit}
                onChange={(e) => set({ allow_credit: e.target.checked })}
                className="h-4 w-4 accent-[var(--c-primary)]"
              />
              Allow credit / part payment
            </label>
            <TextInput
              type="number"
              value={draft.default_credit_days}
              onChange={(e) => set({ default_credit_days: e.target.value })}
              placeholder="Credit days"
              disabled={!draft.allow_credit}
              className="w-[140px]"
            />
          </div>
        </Field>
      </div>

      {wholesale && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field label="Quantity discounts" hint="Applied per line once the packs ordered reach the minimum">
            <div className="space-y-2">
              {tiers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <TextInput
                    type="number"
                    value={t.min_packs || ""}
                    onChange={(e) =>
                      setTiers(tiers.map((x, n) => (n === i ? { ...x, min_packs: Number(e.target.value) || 0 } : x)))
                    }
                    placeholder="Min packs"
                  />
                  <TextInput
                    type="number"
                    value={t.percent || ""}
                    onChange={(e) =>
                      setTiers(tiers.map((x, n) => (n === i ? { ...x, percent: Number(e.target.value) || 0 } : x)))
                    }
                    placeholder="% off"
                  />
                  <button
                    onClick={() => setTiers(tiers.filter((_, n) => n !== i))}
                    aria-label="Remove tier"
                    className="cursor-pointer rounded-md p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button variant="ghost" className="py-2 text-[13px]" onClick={() => setTiers([...tiers, { min_packs: 0, percent: 0 }])}>
                <Plus className="h-4 w-4" /> Add tier
              </Button>
            </div>
          </Field>
          <Field label="Minimum order quantities">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#e5e7eb] px-3 py-2.5 text-[13px] font-medium text-gray-800">
              <input
                type="checkbox"
                checked={draft.enforce_moq}
                onChange={(e) => set({ enforce_moq: e.target.checked })}
                className="h-4 w-4 accent-[var(--c-primary)]"
              />
              Block bills below a medicine&rsquo;s wholesale minimum order (set per medicine in the catalogue)
            </label>
          </Field>
        </div>
      )}

      <Field label="Invoice terms & conditions" className="mt-4" hint="One per line. Blank = the standard terms.">
        <textarea
          value={draft.invoice_terms}
          onChange={(e) => set({ invoice_terms: e.target.value })}
          rows={3}
          className="field h-auto py-2"
          placeholder={"Goods once sold will not be taken back.\nPlease check Batch No, Qty, Exp before taking delivery."}
        />
      </Field>

      <div className="mt-5 flex justify-end">
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Saving…" : `Save ${mode} settings`}
        </Button>
      </div>
    </Card>
  );
};

/* ------------------------------------------------------------------------
   Reconciliation — legacy rows from before the retail / wholesale split.
   Nothing is assigned automatically; the admin chooses.
   ------------------------------------------------------------------------ */

export const ReconciliationCard = ({ onChanged }: { onChanged: (message?: string) => void }) => {
  const state = useModeState();
  const { data, mutate } = useReconciliation(state?.role === "admin");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<Mode>(state?.mode ?? "retail");
  const [withBills, setWithBills] = useState(false);
  const [withCustomers, setWithCustomers] = useState(false);
  const [withSuppliers, setWithSuppliers] = useState(false);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => data?.batches ?? [], [data]);
  const total = rows.length + (data?.bills ?? 0) + (data?.customers ?? 0) + (data?.suppliers ?? 0);
  if (!data || total === 0) return null;

  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.batch.id));
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const assign = async () => {
    if (!picked.size && !withBills && !withCustomers && !withSuppliers) return;
    const parts = [
      picked.size ? `${picked.size} batch(es)` : "",
      withBills ? `${data.bills} bill(s)` : "",
      withCustomers ? `${data.customers} customer(s)` : "",
      withSuppliers ? `${data.suppliers} supplier(s)` : "",
    ].filter(Boolean);
    if (!confirm(`Assign ${parts.join(", ")} to ${MODE_LABEL[target]}? This can't be undone from the app.`)) return;
    setSaving(true);
    const res = await act(
      classifyLegacyRecords(target, {
        batch_ids: [...picked],
        bills: withBills,
        customers: withCustomers,
        suppliers: withSuppliers,
      }),
    );
    setSaving(false);
    if (!res.ok) return;
    setPicked(new Set());
    setWithBills(false);
    setWithCustomers(false);
    setWithSuppliers(false);
    mutate();
    onChanged(`Assigned to ${MODE_LABEL[target]}.`);
  };

  return (
    <Card className="mt-4 p-5">
      <div className="mb-1 flex items-center gap-2">
        <GitMerge className="h-[18px] w-[18px] text-amber-600" />
        <h3 className="text-[15px] font-bold text-gray-900">Reconciliation</h3>
      </div>
      <p className="mb-4 text-[12px] text-gray-500">
        These records were created before the retail / wholesale split, so their dashboard is unknown. They stay
        out of both dashboards until you assign them. Nothing is moved automatically.
      </p>

      {rows.length > 0 && (
        <div className="mb-4 max-h-[300px] overflow-auto rounded-lg border border-[#e5e7eb]">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-[#f4f6f8] text-gray-700">
                <th className="th w-10">
                  <input
                    type="checkbox"
                    checked={allPicked}
                    onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.batch.id)))}
                    aria-label="Select all batches"
                    className="h-4 w-4 accent-[var(--c-primary)]"
                  />
                </th>
                <th className="th">Medicine</th>
                <th className="th">Batch</th>
                <th className="th">EXP DT</th>
                <th className="th">Supplier</th>
                <th className="th text-right">Stock</th>
                <th className="th text-right">Selling (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f3f5]">
              {rows.map((r) => (
                <tr key={r.batch.id} className="cursor-pointer hover:bg-[#fafbfc]" onClick={() => toggle(r.batch.id)}>
                  <td className="td">
                    <input
                      type="checkbox"
                      checked={picked.has(r.batch.id)}
                      onChange={() => toggle(r.batch.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 accent-[var(--c-primary)]"
                    />
                  </td>
                  <td className="td font-medium text-gray-900">{r.medicine.generic_name}</td>
                  <td className="td">{r.batch.batch_no}</td>
                  <td className="td">{monthShort(r.batch.exp_date)}</td>
                  <td className="td">{r.supplier_name}</td>
                  <td className="td text-right">{r.batch.stock_qty}</td>
                  <td className="td text-right">{amount(r.batch.selling_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-gray-800">
        {data.bills > 0 && (
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={withBills} onChange={(e) => setWithBills(e.target.checked)} className="h-4 w-4 accent-[var(--c-primary)]" />
            All {data.bills} legacy bills
          </label>
        )}
        {data.customers > 0 && (
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={withCustomers} onChange={(e) => setWithCustomers(e.target.checked)} className="h-4 w-4 accent-[var(--c-primary)]" />
            All {data.customers} legacy customers
          </label>
        )}
        {data.suppliers > 0 && (
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={withSuppliers} onChange={(e) => setWithSuppliers(e.target.checked)} className="h-4 w-4 accent-[var(--c-primary)]" />
            All {data.suppliers} legacy suppliers
          </label>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-end gap-3">
        <Field label="Assign to" className="w-[200px]">
          <Select value={target} onChange={(e) => setTarget(e.target.value as Mode)}>
            {(state?.modes ?? ["retail"]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Button onClick={assign} disabled={saving || (!picked.size && !withBills && !withCustomers && !withSuppliers)}>
          {saving ? "Assigning…" : "Assign selected"}
        </Button>
      </div>
    </Card>
  );
};

/* ------------------------------------------------------------------------
   Users — one login page for everyone. Admin manages accounts here; each
   staff account is given Retail, Wholesale or both dashboards.
   ------------------------------------------------------------------------ */

type UserDraft = { id?: string; name: string; role: "admin" | "staff"; modes: Mode[]; active: boolean; passcode: string };

export const UsersCard = ({ onChanged }: { onChanged: (message?: string) => void }) => {
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = React.useCallback(() => {
    listUsers()
      .then((res) => setUsers(res.ok ? res.data : []))
      .catch(() => setUsers([]));
  }, []);
  React.useEffect(load, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const res = await act(saveUser(draft));
    setSaving(false);
    if (!res.ok) return;
    setDraft(null);
    load();
    onChanged(draft.id ? "User updated." : "User added.");
  };

  const toggleMode = (m: Mode) =>
    draft && setDraft({ ...draft, modes: draft.modes.includes(m) ? draft.modes.filter((x) => x !== m) : [...draft.modes, m] });

  return (
    <Card className="mt-4 p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-bold text-gray-900">Users &amp; Access</h3>
        <Button
          variant="ghost"
          className="py-2 text-[13px]"
          onClick={() => setDraft({ name: "", role: "staff", modes: ["retail"], active: true, passcode: "" })}
        >
          <Plus className="h-4 w-4" /> Add user
        </Button>
      </div>
      <p className="mb-4 text-[12px] text-gray-500">
        Everyone signs in on the same login page with their own passcode. Admins see both dashboards; choose
        which dashboards each staff member can open. Changes apply immediately, even to users already signed in.
      </p>

      <div className="overflow-x-auto rounded-lg border border-[#e5e7eb]">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="bg-[#f4f6f8] text-gray-700">
              <th className="th">Name</th>
              <th className="th">Role</th>
              <th className="th">Dashboards</th>
              <th className="th">Status</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f3f5]">
            {(users ?? []).map((u) => (
              <tr key={u.id}>
                <td className="td font-medium text-gray-900">{u.name}</td>
                <td className="td capitalize">{u.role}</td>
                <td className="td">
                  <div className="flex flex-wrap gap-1.5">
                    {u.modes.map((m) => (
                      <Pill key={m} tone="blue">
                        {MODE_LABEL[m]}
                      </Pill>
                    ))}
                  </div>
                </td>
                <td className="td">{u.active ? <Pill tone="green">Active</Pill> : <Pill tone="gray">Disabled</Pill>}</td>
                <td className="td">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => setDraft({ id: u.id, name: u.name, role: u.role, modes: u.modes, active: u.active, passcode: "" })}
                      aria-label="Edit user"
                      className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[var(--c-deep)]"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete ${u.name}? They will no longer be able to sign in.`)) return;
                        const res = await act(deleteUser(u.id));
                        if (res.ok) {
                          load();
                          onChanged("User deleted.");
                        }
                      }}
                      aria-label="Delete user"
                      className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users !== null && !users.length && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[13px] text-gray-400">
                  No user accounts yet. The admin passcode from the server settings always works.
                </td>
              </tr>
            )}
            {users === null && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[13px] text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit User" : "Add User"}
        subtitle="Signs in on the same login page with this passcode"
        width="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <Field label="Name">
              <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Staff name" />
            </Field>
            <Field label="Role">
              <Select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as UserDraft["role"] })}>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Field label="Dashboard access" hint={draft.role === "admin" ? "Admins always have both dashboards." : undefined}>
              <div className="flex flex-wrap gap-2">
                {(["retail", "wholesale"] as Mode[]).map((m) => {
                  const on = draft.role === "admin" || draft.modes.includes(m);
                  return (
                    <label
                      key={m}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium ${
                        on ? "border-[var(--c-primary)] bg-[var(--c-mint)]" : "border-[#e5e7eb]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={draft.role === "admin"}
                        onChange={() => toggleMode(m)}
                        className="h-4 w-4 accent-[var(--c-primary)]"
                      />
                      {MODE_LABEL[m]}
                    </label>
                  );
                })}
              </div>
            </Field>
            <Field
              label={draft.id ? "New passcode" : "Passcode"}
              hint={draft.id ? "Leave blank to keep the current passcode." : "At least 4 characters, unique to this user."}
            >
              <TextInput
                type="password"
                autoComplete="new-password"
                value={draft.passcode}
                onChange={(e) => setDraft({ ...draft, passcode: e.target.value })}
              />
            </Field>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-gray-800">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                className="h-4 w-4 accent-[var(--c-primary)]"
              />
              Account active (can sign in)
            </label>
          </div>
        )}
      </Modal>
    </Card>
  );
};
