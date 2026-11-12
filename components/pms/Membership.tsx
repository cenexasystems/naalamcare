"use client";

import React, { useMemo, useState } from "react";
import { BadgeCheck, History, Pencil, Plus, Power, RefreshCw, Search } from "lucide-react";
import type { Customer } from "@/lib/types";
import { amount, dateSlash, money, todayIso } from "@/lib/format";
import {
  MEMBER_METHODS,
  canRenew,
  memberForBill,
  memberStatus,
  periodEnd,
  planRatesLabel,
  renewalFee,
  renewalPeriod,
  statusGivesDiscount,
  validityLabel,
  type MemberDiscount,
  type MemberStatus,
  type Membership as MemberRow,
  type MembershipData,
  type MembershipPlan,
  type MembershipSettings,
  type ValidityUnit,
} from "@/lib/membership";
import {
  registerMembership,
  renewMembership,
  saveMembershipPlan,
  saveMembershipSettings,
  updateMembership,
} from "@/lib/actions";
import { act, useMode, useModeState } from "./mode-context";
import { useMemberships, useSettings } from "./data";
import { Button, Card, Field, Modal, PageTitle, Pill, Select, TextInput } from "./ui";

const STATUS_LABEL: Record<MemberStatus, string> = {
  ACTIVE: "Active",
  EXPIRING: "Expiring soon",
  GRACE: "Grace period",
  EXPIRED: "Expired",
  UPCOMING: "Starts later",
  "PAYMENT PENDING": "Payment pending",
  INACTIVE: "Inactive",
};
const STATUS_TONE: Record<MemberStatus, "green" | "amber" | "red" | "gray" | "blue"> = {
  ACTIVE: "green",
  EXPIRING: "amber",
  GRACE: "amber",
  EXPIRED: "red",
  UPCOMING: "blue",
  "PAYMENT PENDING": "amber",
  INACTIVE: "gray",
};
export const MemberStatusPill = ({ status }: { status: MemberStatus }) => <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;

const PaymentFields = ({
  method,
  status,
  onMethod,
  onStatus,
}: {
  method: string;
  status: string;
  onMethod: (v: string) => void;
  onStatus: (v: string) => void;
}) => (
  <>
    <Field label="Payment Method">
      <Select value={method} onChange={(e) => onMethod(e.target.value)}>
        {MEMBER_METHODS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </Select>
    </Field>
    <Field label="Payment Status" hint="The discount starts once this is Paid">
      <Select value={status} onChange={(e) => onStatus(e.target.value)}>
        <option value="Paid">Paid</option>
        <option value="Pending">Pending</option>
      </Select>
    </Field>
  </>
);

/* ------------------------------- register -------------------------------- */

/** Mount only while open. Reuses the customer record; a new mobile number creates one. */
export const RegisterMembershipModal = ({
  customer,
  phone: startPhone = "",
  onClose,
  onDone,
}: {
  customer?: Customer | null;
  phone?: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) => {
  const mode = useMode();
  const { data } = useMemberships();
  const plans = (data?.plans ?? []).filter((p) => p.active);
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? startPhone);
  const [planId, setPlanId] = useState("");
  const [start, setStart] = useState(todayIso());
  const [method, setMethod] = useState("Cash");
  const [status, setStatus] = useState("Paid");
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const plan = plans.find((p) => p.id === planId) ?? (plans.length === 1 ? plans[0] : undefined);

  return (
    <Modal
      open
      onClose={onClose}
      title="Register Membership"
      subtitle="A membership ID is generated automatically"
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || !plan}
            onClick={async () => {
              if (!plan) return;
              setSaving(true);
              const res = await act(
                registerMembership(mode, {
                  customer_id: customer?.id ?? null,
                  name,
                  phone,
                  plan_id: plan.id,
                  start_date: start,
                  payment_method: method,
                  payment_status: status,
                  allow_duplicate: allowDuplicate,
                }),
              );
              setSaving(false);
              if (res.ok) onDone(`Membership ${res.data} registered.`);
            }}
          >
            {saving ? "Saving…" : "Register"}
          </Button>
        </>
      }
    >
      {!plans.length ? (
        <p className="py-8 text-center text-[13.5px] text-gray-500">No active plans yet. An admin can add one in the Membership section.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Customer Name">
            <TextInput value={name} disabled={Boolean(customer)} onChange={(e) => setName(e.target.value)} placeholder="Enter customer name" />
          </Field>
          <Field label="Mobile Number">
            <TextInput
              value={phone}
              disabled={Boolean(customer)}
              inputMode="numeric"
              onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
              placeholder="10-digit mobile number"
            />
          </Field>
          <Field label="Membership Plan" className="sm:col-span-2">
            <Select value={plan?.id ?? ""} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Select a plan</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {money(p.fee)} · {validityLabel(p.validity_value, p.validity_unit)} · {planRatesLabel(p, data?.settings.category_rates)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Start Date">
            <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Expiry Date">
            <TextInput value={plan && start ? dateSlash(periodEnd(start, plan.validity_value, plan.validity_unit)) : "—"} disabled />
          </Field>
          <Field label="Membership Fee">
            <TextInput value={plan ? money(plan.fee) : "—"} disabled />
          </Field>
          <div className="hidden sm:block" />
          <PaymentFields method={method} status={status} onMethod={setMethod} onStatus={setStatus} />
          <AdminDuplicateSwitch on={allowDuplicate} onToggle={setAllowDuplicate} />
        </div>
      )}
    </Modal>
  );
};

const AdminDuplicateSwitch = ({ on, onToggle }: { on: boolean; onToggle: (v: boolean) => void }) => {
  if (useModeState()?.role !== "admin") return null;
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] font-medium text-gray-700 sm:col-span-2">
      <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--c-deep)]" />
      Admin: allow a second membership for the same customer and period
    </label>
  );
};

/* -------------------------------- renew ---------------------------------- */

export const RenewMembershipModal = ({
  member,
  data,
  onClose,
  onDone,
}: {
  member: MemberRow;
  data: MembershipData;
  onClose: () => void;
  onDone: (message: string) => void;
}) => {
  const mode = useMode();
  const plan = data.plans.find((p) => p.id === member.plan_id);
  const [method, setMethod] = useState("Cash");
  const [status, setStatus] = useState("Paid");
  const [saving, setSaving] = useState(false);
  const period = plan ? renewalPeriod(member, plan, todayIso()) : null;
  return (
    <Modal
      open
      onClose={onClose}
      title="Renew Membership"
      subtitle={`${member.customer_name || member.customer_phone} · ${member.member_no}`}
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || !plan}
            onClick={async () => {
              setSaving(true);
              const res = await act(renewMembership(mode, { id: member.id, payment_method: method, payment_status: status }));
              setSaving(false);
              if (res.ok) onDone(`Renewed until ${dateSlash(res.data)}.`);
            }}
          >
            {saving ? "Saving…" : "Renew"}
          </Button>
        </>
      }
    >
      {plan && period && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Plan">
            <TextInput value={plan.name} disabled />
          </Field>
          <Field label="Renewal Fee">
            <TextInput value={money(renewalFee(plan, data.settings))} disabled />
          </Field>
          <Field label="New Period Starts">
            <TextInput value={dateSlash(period.start)} disabled />
          </Field>
          <Field label="New Expiry Date">
            <TextInput value={dateSlash(period.expiry)} disabled />
          </Field>
          <PaymentFields method={method} status={status} onMethod={setMethod} onStatus={setStatus} />
        </div>
      )}
    </Modal>
  );
};

/* --------------------------- billing screen panel ------------------------ */

const REASON: Record<string, string> = {
  "no-eligible": "No eligible items on this bill.",
  "existing-better": "Existing discounts already give this customer more.",
};

/** Membership box in the Bill Summary. `onPhone` shows the mobile lookup (retail). */
export const MemberBillPanel = ({
  phone,
  onPhone,
  customer,
  data,
  date,
  result,
  hasItems,
  onDone,
}: {
  phone?: string;
  onPhone?: (phone: string) => void;
  customer: Customer | null;
  data: MembershipData;
  date: string;
  result: MemberDiscount | null;
  hasItems: boolean;
  onDone: (message: string) => void;
}) => {
  const [registering, setRegistering] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const info = memberForBill(data, customer?.id, date);
  const m = info.membership;
  const lookupDone = Boolean(customer) || (phone ?? "").length === 10;

  return (
    <div className="mt-3 rounded-lg border border-[#e3e7ea] bg-[#fafbfc] px-3 py-2.5 text-[12.5px]">
      <p className="mb-1.5 flex items-center gap-1.5 font-bold text-gray-900">
        <BadgeCheck className="h-4 w-4 text-[var(--c-deep)]" /> Membership
      </p>
      {onPhone && (
        <input
          value={phone ?? ""}
          inputMode="numeric"
          aria-label="Customer mobile number"
          onChange={(e) => onPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
          placeholder="Customer mobile number"
          className="field mb-1.5 h-9"
        />
      )}
      {m ? (
        <div className="space-y-1">
          <p className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-semibold text-gray-900">{m.customer_name || customer?.name || "Member"}</span>
            <MemberStatusPill status={info.status!} />
          </p>
          <p className="text-[11.5px] text-gray-600">
            {m.plan_name} · {m.member_no} · till {dateSlash(m.expiry_date)}
          </p>
          {info.usable && hasItems && result && result.discount <= 0 && (
            <p className="text-[11.5px] text-gray-500">
              {result.reason === "min-bill" && info.plan ? `Needs a bill of ${money(info.plan.min_bill)} or more.` : REASON[result.reason] ?? ""}
            </p>
          )}
          {!info.usable && <p className="text-[11.5px] font-medium text-amber-700">No member discount on this bill.</p>}
          {!info.usable && canRenew(info.status!, data.settings) && (
            <button onClick={() => setRenewing(true)} className="cursor-pointer text-[12px] font-bold text-[#1f6feb] hover:underline">
              Renew Membership
            </button>
          )}
        </div>
      ) : lookupDone ? (
        <p className="flex flex-wrap items-center justify-between gap-1.5 text-[11.5px] text-gray-600">
          Not a member
          <button onClick={() => setRegistering(true)} className="cursor-pointer text-[12px] font-bold text-[#1f6feb] hover:underline">
            Register Membership
          </button>
        </p>
      ) : (
        <p className="text-[11.5px] text-gray-500">{onPhone ? "Enter the mobile number to check membership." : "Select the customer to check membership."}</p>
      )}
      {registering && (
        <RegisterMembershipModal
          customer={customer}
          phone={phone}
          onClose={() => setRegistering(false)}
          onDone={(message) => {
            setRegistering(false);
            onDone(message);
          }}
        />
      )}
      {renewing && m && (
        <RenewMembershipModal
          member={m}
          data={data}
          onClose={() => setRenewing(false)}
          onDone={(message) => {
            setRenewing(false);
            onDone(message);
          }}
        />
      )}
    </div>
  );
};

/* ---------------------------- Membership screen -------------------------- */

const StatCard = ({ label, value, tone = "text-gray-900" }: { label: string; value: number; tone?: string }) => (
  <Card className="p-4">
    <p className="text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
    <p className={`mt-1 text-[24px] font-extrabold ${tone}`}>{value}</p>
  </Card>
);

const iconBtn = "cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[var(--c-deep)]";

export const Membership = ({ onChanged, role }: { onChanged: (message?: string) => void; role: "admin" | "staff" }) => {
  const mode = useMode();
  const { data } = useMemberships();
  const { data: scoped } = useSettings();
  const [search, setSearch] = useState("");
  const [registering, setRegistering] = useState(false);
  const [planEdit, setPlanEdit] = useState<MembershipPlan | "new" | null>(null);
  const [viewing, setViewing] = useState<MemberRow | null>(null);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [renewing, setRenewing] = useState<MemberRow | null>(null);
  const isAdmin = role === "admin";
  const today = todayIso();

  const rows = useMemo(
    () => (data?.members ?? []).map((m) => ({ m, status: memberStatus(m, today, data!.settings) })),
    [data, today],
  );
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ m }) => m.customer_name.toLowerCase().includes(q) || m.customer_phone.includes(q) || m.member_no.toLowerCase().includes(q));
  }, [rows, search]);

  if (!data) return <p className="animate-pulse py-24 text-center text-[12px] font-bold uppercase tracking-[0.2em] text-gray-400">Loading…</p>;

  const activeCount = rows.filter((r) => statusGivesDiscount(r.status)).length;
  const expiredCount = rows.filter((r) => r.status === "EXPIRED").length;
  const expiringCount = rows.filter((r) => r.status === "EXPIRING").length;

  return (
    <div>
      <PageTitle
        title="Membership"
        subtitle="Members, plans and renewals"
        right={
          <Button variant="blue" onClick={() => setRegistering(true)}>
            <Plus className="h-4 w-4" /> Register Membership
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total Members" value={rows.length} />
        <StatCard label="Active Members" value={activeCount} tone="text-[var(--c-deep)]" />
        <StatCard label="Expired Members" value={expiredCount} tone={expiredCount ? "text-red-600" : "text-gray-900"} />
        <StatCard label="Membership Plans" value={data.plans.length} />
      </div>

      {expiringCount > 0 && (
        <p className="mb-4 rounded-lg bg-[#fffbeb] px-4 py-2.5 text-[13px] font-medium text-[#92400e]">
          {expiringCount} membership{expiringCount === 1 ? "" : "s"} will expire within {data.settings.reminder_days} days.
        </p>
      )}

      {/* Plans */}
      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[14px] font-bold text-gray-900">Membership Plans</h3>
          {isAdmin && (
            <Button variant="ghost" onClick={() => setPlanEdit("new")}>
              <Plus className="h-4 w-4" /> Add Plan
            </Button>
          )}
        </div>
        {!data.plans.length && <p className="py-6 text-center text-[13px] text-gray-400">No plans yet.</p>}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.plans.map((p) => (
            <div key={p.id} className="rounded-lg border border-[#e5e7eb] p-3 text-[12.5px] text-gray-600">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-[14px] font-bold text-gray-900">{p.name}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <Pill tone={p.active ? "green" : "gray"}>{p.active ? "Active" : "Inactive"}</Pill>
                  {isAdmin && (
                    <button aria-label={`Edit ${p.name}`} onClick={() => setPlanEdit(p)} className={iconBtn}>
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </span>
              </div>
              <p>
                {money(p.fee)} · {validityLabel(p.validity_value, p.validity_unit)}
              </p>
              <p className="font-semibold text-[var(--c-deep)]">{planRatesLabel(p, data.settings.category_rates)}</p>
              <p className="text-[11.5px]">
                {p.min_bill > 0 ? `Min bill ₹${amount(p.min_bill)}` : "No minimum bill"} · {p.max_discount > 0 ? `Max ₹${amount(p.max_discount)}` : "No maximum"}
              </p>
              <p className="truncate text-[11.5px]">{p.categories.length ? p.categories.join(", ") : "All categories"}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Members */}
      <div className="relative mb-4 max-w-[420px]">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, mobile or membership ID"
          className="h-11 w-full rounded-lg border border-[#e2e6ea] bg-white pl-10 pr-3 text-[13.5px] outline-none transition placeholder:text-gray-400 focus:border-[var(--c-primary)]"
        />
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="bg-[#f4f6f8] text-gray-700">
                <th className="th">Customer Name</th>
                <th className="th">Mobile</th>
                <th className="th">Membership ID</th>
                <th className="th">Plan</th>
                <th className="th">Start Date</th>
                <th className="th">Expiry Date</th>
                <th className="th">Status</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f3f5]">
              {shown.map(({ m, status }) => (
                <tr key={m.id} className="transition hover:bg-[#fafbfc]">
                  <td className="td font-medium text-gray-900">{m.customer_name || "—"}</td>
                  <td className="td">{m.customer_phone || "—"}</td>
                  <td className="td font-semibold text-[#1f6feb]">{m.member_no}</td>
                  <td className="td">{m.plan_name}</td>
                  <td className="td">{dateSlash(m.start_date)}</td>
                  <td className="td">{dateSlash(m.expiry_date)}</td>
                  <td className="td">
                    <MemberStatusPill status={status} />
                  </td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-1">
                      <button aria-label="View history" title="View history" onClick={() => setViewing(m)} className={iconBtn}>
                        <History className="h-4 w-4" />
                      </button>
                      {canRenew(status, data.settings) && (
                        <button aria-label="Renew" title="Renew" onClick={() => setRenewing(m)} className={iconBtn}>
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      )}
                      {isAdmin && (
                        <>
                          <button aria-label="Edit or change plan" title="Edit / change plan" onClick={() => setEditing(m)} className={iconBtn}>
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            aria-label={m.active ? "Deactivate" : "Activate"}
                            title={m.active ? "Deactivate" : "Activate"}
                            onClick={async () => {
                              if (m.active && !confirm(`Deactivate ${m.member_no}? The discount stops until it is activated again.`)) return;
                              const res = await act(updateMembership(mode, { id: m.id, active: !m.active }));
                              if (res.ok) onChanged(m.active ? "Membership deactivated." : "Membership activated.");
                            }}
                            className={m.active ? "cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-red-50 hover:text-red-600" : iconBtn}
                          >
                            <Power className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center text-[13.5px] text-gray-400">
                    No members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {registering && (
        <RegisterMembershipModal
          onClose={() => setRegistering(false)}
          onDone={(message) => {
            setRegistering(false);
            onChanged(message);
          }}
        />
      )}
      {planEdit && (
        <PlanModal
          plan={planEdit === "new" ? null : planEdit}
          settings={data.settings}
          categories={scoped?.product_types ?? []}
          onClose={() => setPlanEdit(null)}
          onDone={(message) => {
            setPlanEdit(null);
            onChanged(message);
          }}
        />
      )}
      {renewing && (
        <RenewMembershipModal
          member={renewing}
          data={data}
          onClose={() => setRenewing(null)}
          onDone={(message) => {
            setRenewing(null);
            onChanged(message);
          }}
        />
      )}
      {editing && (
        <EditMemberModal
          member={editing}
          plans={data.plans}
          onClose={() => setEditing(null)}
          onDone={(message) => {
            setEditing(null);
            onChanged(message);
          }}
        />
      )}
      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={viewing.customer_name || viewing.member_no} subtitle={`${viewing.member_no} · History`} width="max-w-2xl">
          <div className="max-h-[420px] overflow-y-auto text-[12.5px]">
            {data.events
              .filter((e) => e.membership_id === viewing.id)
              .map((e) => (
                <div key={e.id} className="border-b border-[#f1f3f5] py-2.5 last:border-0">
                  <p className="flex flex-wrap justify-between gap-2 font-semibold text-gray-900">
                    <span>
                      {e.type} · {e.plan_name}
                    </span>
                    <span>{e.amount > 0 ? money(e.amount) : ""}</span>
                  </p>
                  <p className="text-[11.5px] text-gray-500">
                    {dateSlash(e.created_at.slice(0, 10))} · Period {dateSlash(e.start_date)} – {dateSlash(e.expiry_date)}
                    {e.payment_method ? ` · ${e.payment_method}` : ""}
                    {e.payment_status ? ` · ${e.payment_status}` : ""}
                    {e.actor ? ` · by ${e.actor}` : ""}
                  </p>
                  {e.note && <p className="text-[11.5px] text-gray-600">{e.note}</p>}
                </div>
              ))}
          </div>
        </Modal>
      )}
    </div>
  );
};

/* ---------------------------------- plan --------------------------------- */

const CategoryPicker = ({ all, value, onChange }: { all: string[]; value: string[]; onChange: (v: string[]) => void }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-[#e5e7eb] px-3 py-2.5">
    {all.map((c) => (
      <label key={c} className="flex cursor-pointer items-center gap-2 text-[13px] text-gray-800">
        <input
          type="checkbox"
          checked={value.includes(c)}
          onChange={(e) => onChange(e.target.checked ? [...value, c] : value.filter((x) => x !== c))}
          className="h-4 w-4 cursor-pointer accent-[var(--c-deep)]"
        />
        {c}
      </label>
    ))}
    {!all.length && <span className="text-[12px] text-gray-400">No categories yet.</span>}
  </div>
);

const ValidityFields = ({
  value,
  unit,
  onValue,
  onUnit,
}: {
  value: string;
  unit: ValidityUnit;
  onValue: (v: string) => void;
  onUnit: (v: ValidityUnit) => void;
}) => (
  <div className="flex gap-2">
    <TextInput type="number" min={1} value={value} onChange={(e) => onValue(e.target.value)} />
    <Select value={unit} onChange={(e) => onUnit(e.target.value as ValidityUnit)}>
      <option value="days">Days</option>
      <option value="months">Months</option>
      <option value="years">Years</option>
    </Select>
  </div>
);

const blank = (v: number) => (v ? String(v) : "");

const PlanModal = ({
  plan,
  settings,
  categories,
  onClose,
  onDone,
}: {
  plan: MembershipPlan | null;
  settings: MembershipSettings;
  categories: string[];
  onClose: () => void;
  onDone: (message: string) => void;
}) => {
  const mode = useMode();
  const [name, setName] = useState(plan?.name ?? "");
  const [fee, setFee] = useState(blank(plan?.fee ?? settings.default_fee));
  const [validity, setValidity] = useState(String(plan?.validity_value ?? settings.default_validity_value));
  const [unit, setUnit] = useState<ValidityUnit>(plan?.validity_unit ?? settings.default_validity_unit);
  const [percent, setPercent] = useState(blank(plan?.discount_percent ?? settings.default_percent));
  const [minBill, setMinBill] = useState(blank(plan?.min_bill ?? settings.default_min_bill));
  const [maxDiscount, setMaxDiscount] = useState(blank(plan?.max_discount ?? settings.default_max_discount));
  const [cats, setCats] = useState<string[]>(plan?.categories ?? settings.default_categories);
  const [active, setActive] = useState(plan?.active ?? true);
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={plan ? "Edit Plan" : "Add Plan"}
      subtitle="Changes apply to this plan's members from their next bill"
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const res = await act(
                saveMembershipPlan(mode, {
                  id: plan?.id,
                  name,
                  fee: Number(fee) || 0,
                  validity_value: Number(validity) || 0,
                  validity_unit: unit,
                  discount_percent: Number(percent) || 0,
                  min_bill: Number(minBill) || 0,
                  max_discount: Number(maxDiscount) || 0,
                  categories: cats,
                  active,
                }),
              );
              setSaving(false);
              if (res.ok) onDone(plan ? "Plan updated." : "Plan added.");
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Membership Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter plan name" />
        </Field>
        <Field label="Membership Fee (₹)">
          <TextInput type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Membership Validity">
          <ValidityFields value={validity} unit={unit} onValue={setValidity} onUnit={setUnit} />
        </Field>
        <Field label="Discount Percentage (%)" hint="For categories without their own rate in Settings → Membership">
          <TextInput type="number" min={0} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Minimum Bill Amount (₹)" hint="Blank = no minimum">
          <TextInput type="number" min={0} value={minBill} onChange={(e) => setMinBill(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Maximum Discount Amount (₹)" hint="Blank = no maximum">
          <TextInput type="number" min={0} value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Eligible Product Categories" hint="None ticked = every category" className="sm:col-span-2">
          <CategoryPicker all={categories} value={cats} onChange={setCats} />
        </Field>
        <Field label="Status">
          <Select value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
};

/* ------------------------------ edit a member ---------------------------- */

const EditMemberModal = ({
  member,
  plans,
  onClose,
  onDone,
}: {
  member: MemberRow;
  plans: MembershipPlan[];
  onClose: () => void;
  onDone: (message: string) => void;
}) => {
  const mode = useMode();
  const [planId, setPlanId] = useState(member.plan_id);
  const [start, setStart] = useState(member.start_date);
  const [expiry, setExpiry] = useState(member.expiry_date);
  const [method, setMethod] = useState(member.payment_method || "Cash");
  const [status, setStatus] = useState<string>(member.payment_status);
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit Membership"
      subtitle={`${member.customer_name || member.customer_phone} · ${member.member_no}`}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const res = await act(
                updateMembership(mode, { id: member.id, plan_id: planId, start_date: start, expiry_date: expiry, payment_method: method, payment_status: status }),
              );
              setSaving(false);
              if (res.ok) onDone("Membership updated.");
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Membership Plan" className="sm:col-span-2">
          <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans
              .filter((p) => p.active || p.id === member.plan_id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Start Date">
          <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Expiry Date">
          <TextInput type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
        <PaymentFields method={method} status={status} onMethod={setMethod} onStatus={setStatus} />
      </div>
    </Modal>
  );
};

/* -------------------------- Settings → Membership ------------------------ */

const SettingSwitch = ({ on, label, hint, onToggle }: { on: boolean; label: string; hint: string; onToggle: () => void }) => (
  <button onClick={onToggle} className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-[#e5e7eb] px-4 py-3 text-left transition hover:bg-gray-50">
    <span>
      <span className="block text-[13.5px] font-semibold text-gray-900">{label}</span>
      <span className="block text-[11.5px] text-gray-500">{hint}</span>
    </span>
    <span role="switch" aria-checked={on} className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-[var(--c-primary)]" : "bg-gray-300"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </span>
  </button>
);

export const MembershipSettingsTab = ({ categories, onChanged }: { categories: string[]; onChanged: (message?: string) => void }) => {
  const { data } = useMemberships();
  if (!data) return <p className="animate-pulse py-16 text-center text-[12px] font-bold uppercase tracking-[0.2em] text-gray-400">Loading…</p>;
  return <MembershipSettingsForm key={JSON.stringify(data.settings)} settings={data.settings} categories={categories} onChanged={onChanged} />;
};

const SectionTitle = ({ children }: { children: React.ReactNode }) => <h3 className="mb-3 text-[14px] font-bold text-gray-900">{children}</h3>;

const MembershipSettingsForm = ({
  settings,
  categories,
  onChanged,
}: {
  settings: MembershipSettings;
  categories: string[];
  onChanged: (message?: string) => void;
}) => {
  const mode = useMode();
  const [s, setS] = useState(settings);
  const [saving, setSaving] = useState(false);
  const flip = (key: "enabled" | "retail" | "wholesale" | "allow_multiple_plans" | "members_only" | "allow_combine" | "allow_renew_after_expiry") => setS({ ...s, [key]: !s[key] });
  const num = (key: keyof MembershipSettings) => ({
    type: "number",
    min: 0,
    value: blank(s[key] as number),
    placeholder: "0",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [key]: Number(e.target.value) || 0 }),
  });

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card className="p-5">
        <SectionTitle>General</SectionTitle>
        <div className="space-y-2">
          <SettingSwitch on={s.enabled} label="Enable Membership" hint="Off: no membership screens, and bills work exactly as before" onToggle={() => flip("enabled")} />
          <SettingSwitch on={s.retail} label="Enable Retail" hint="Use memberships on the Retail dashboard" onToggle={() => flip("retail")} />
          <SettingSwitch on={s.wholesale} label="Enable Wholesale" hint="Use memberships on the Wholesale dashboard" onToggle={() => flip("wholesale")} />
          <SettingSwitch on={s.allow_multiple_plans} label="Allow Multiple Plans" hint="Off: only one plan can be active on a dashboard" onToggle={() => flip("allow_multiple_plans")} />
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle>Pricing</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Membership Fee (₹)" hint="Filled into each new plan">
            <TextInput {...num("default_fee")} />
          </Field>
          <Field label="Renewal Fee (₹)" hint="Blank = the plan's membership fee">
            <TextInput {...num("renewal_fee")} />
          </Field>
          <Field label="Validity Period" hint="Filled into each new plan" className="sm:col-span-2">
            <ValidityFields
              value={String(s.default_validity_value)}
              unit={s.default_validity_unit}
              onValue={(v) => setS({ ...s, default_validity_value: Number(v) || 0 })}
              onUnit={(v) => setS({ ...s, default_validity_unit: v })}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle>Discount</SectionTitle>
        <p className="mb-3 text-[11.5px] text-gray-500">The category rates apply to every plan. Discount %, minimum, maximum and eligible categories below only fill into each new plan; each plan&rsquo;s own values are what bills use.</p>
        <Field label="Member Discount by Category (%)" hint="Each item gets its category's rate. Blank = the plan's Discount %.">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {categories.map((c) => (
              <label key={c} className="flex items-center gap-2 rounded-lg border border-[#e5e7eb] px-3 py-2 text-[13px] font-medium text-gray-800">
                <span className="min-w-0 flex-1 truncate">{c}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  aria-label={`${c} member discount %`}
                  value={s.category_rates[c] ?? ""}
                  placeholder="—"
                  onChange={(e) => {
                    const rates = { ...s.category_rates };
                    if (e.target.value === "") delete rates[c];
                    else rates[c] = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                    setS({ ...s, category_rates: rates });
                  }}
                  className="h-8 w-16 rounded-md border border-[#d8dde3] px-2 text-right text-[13px] outline-none focus:border-[var(--c-primary)]"
                />
                <span className="text-gray-400">%</span>
              </label>
            ))}
          </div>
        </Field>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Discount %">
            <TextInput {...num("default_percent")} max={100} />
          </Field>
          <Field label="Min Bill (₹)">
            <TextInput {...num("default_min_bill")} />
          </Field>
          <Field label="Max Discount (₹)">
            <TextInput {...num("default_max_discount")} />
          </Field>
          <Field label="Eligible Categories" hint="None ticked = every category" className="sm:col-span-3">
            <CategoryPicker all={categories} value={s.default_categories} onChange={(v) => setS({ ...s, default_categories: v })} />
          </Field>
        </div>
        <div className="mt-3">
          <SettingSwitch
            on={s.members_only}
            label="Members get only the membership discount"
            hint={
              s.members_only
                ? "On: members get no offers, free gifts or automatic discounts — only their membership discount"
                : "Off: members also get offers; the membership discount works with the automatic discount as below"
            }
            onToggle={() => flip("members_only")}
          />
        </div>
        <div className={`mt-2 ${s.members_only ? "opacity-50" : ""}`}>
          <SettingSwitch
            on={s.allow_combine}
            label="Combine with existing discounts"
            hint={s.allow_combine ? "On: member discount comes on top of automatic and bill-offer discounts" : "Off: the customer gets whichever is bigger, never both"}
            onToggle={() => flip("allow_combine")}
          />
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle>Expiry</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Expiry Reminder (days)" hint="Shows Expiring soon this long before">
            <TextInput {...num("reminder_days")} />
          </Field>
          <Field label="Grace Period (days)" hint="Discount continues this long after expiry">
            <TextInput {...num("grace_days")} />
          </Field>
        </div>
        <div className="mt-3">
          <SettingSwitch
            on={s.allow_renew_after_expiry}
            label="Allow Renewal After Expiry"
            hint="Off: an expired customer must register again"
            onToggle={() => flip("allow_renew_after_expiry")}
          />
        </div>
      </Card>

      <div className="xl:col-span-2">
        <Button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            const res = await act(saveMembershipSettings(mode, s));
            setSaving(false);
            if (res.ok) onChanged("Membership settings saved.");
          }}
        >
          {saving ? "Saving…" : "Save Membership Settings"}
        </Button>
      </div>
    </div>
  );
};
