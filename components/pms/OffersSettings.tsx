"use client";

import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, Gift, Pencil, Plus, Save, Trash2 } from "lucide-react";
import type { MedicineWithBatches } from "@/lib/types";
import { offerBadge, offerStatus, type Offer, type OfferStatus, type OfferType } from "@/lib/offers";
import { deleteOffer, offerHistory, offerUsage, saveOffer, type OfferRedemption, type OfferUsage } from "@/lib/actions";
import { amount, dateSlash, money, todayIso } from "@/lib/format";
import { periodRange, type Period } from "@/lib/period";
import { downloadExcel } from "@/lib/xlsx";
import { Button, Card, Field, Modal, Pill, Select, TextInput } from "./ui";
import { PeriodFilter } from "./PeriodFilter";
import { act } from "./mode-context";

/* ------------------------------------------------------------------------
   Settings → Offers (retail): create / edit / schedule offers, and see how
   they perform. How offers apply is in lib/offers.ts.
   ------------------------------------------------------------------------ */

const STATUS: Record<OfferStatus, { label: string; tone: "green" | "blue" | "gray" | "amber" }> = {
  active: { label: "ACTIVE", tone: "green" },
  scheduled: { label: "SCHEDULED", tone: "blue" },
  expired: { label: "EXPIRED", tone: "gray" },
  off: { label: "OFF", tone: "amber" },
};

const TYPE_LABEL: Record<OfferType, string> = {
  buy_get: "Buy X Get Y / gift with product",
  bill_gift: "Gift above a bill amount",
  price_off: "Price offer (% / ₹ off / promo price)",
};

type Draft = {
  id?: string;
  name: string;
  description: string;
  type: OfferType;
  target: "product" | "category";
  buy_medicine_id: string;
  buy_category: string;
  buy_qty: string;
  reward_same: boolean;
  reward_medicine_id: string;
  /** Other products the counter may give instead */
  reward_choices: string[];
  reward_qty: string;
  reward_mode: Offer["reward_mode"];
  reward_value: string;
  off_mode: Offer["off_mode"];
  off_value: string;
  min_bill: string;
  repeatable: boolean;
  max_free_per_bill: string;
  max_per_customer: string;
  max_total: string;
  starts_on: string;
  ends_on: string;
  active: boolean;
  auto_apply: boolean;
  stack_auto: boolean;
  priority: string;
};

const blank = (type: OfferType): Draft => ({
  name: "",
  description: "",
  type,
  target: "product",
  buy_medicine_id: "",
  buy_category: "",
  buy_qty: "1",
  reward_same: type === "buy_get",
  reward_medicine_id: "",
  reward_choices: [],
  reward_qty: "1",
  reward_mode: "free",
  reward_value: "",
  off_mode: "percent",
  off_value: "",
  min_bill: "",
  repeatable: true,
  max_free_per_bill: "",
  max_per_customer: "",
  max_total: "",
  starts_on: todayIso(),
  ends_on: "",
  active: true,
  auto_apply: true,
  stack_auto: false,
  priority: "0",
});

const num = (n: number) => (n ? String(n) : "");
const fromOffer = (o: Offer): Draft => ({
  id: o.id,
  name: o.name,
  description: o.description,
  type: o.type,
  target: o.buy_category ? "category" : "product",
  buy_medicine_id: o.buy_medicine_id ?? "",
  buy_category: o.buy_category,
  buy_qty: String(o.buy_qty),
  reward_same: o.type === "buy_get" && !o.buy_category && o.reward_medicine_id === o.buy_medicine_id,
  reward_medicine_id: o.reward_medicine_id ?? "",
  reward_choices: o.reward_choices ?? [],
  reward_qty: String(o.reward_qty),
  reward_mode: o.reward_mode,
  reward_value: num(o.reward_value),
  off_mode: o.off_mode,
  off_value: num(o.off_value),
  min_bill: num(o.min_bill),
  repeatable: o.repeatable,
  max_free_per_bill: num(o.max_free_per_bill),
  max_per_customer: num(o.max_per_customer),
  max_total: num(o.max_total),
  starts_on: o.starts_on,
  ends_on: o.ends_on,
  active: o.active,
  auto_apply: o.auto_apply,
  stack_auto: o.stack_auto,
  priority: String(o.priority),
});

export const OffersSettings = ({
  offers,
  medicines,
  categories,
  onChanged,
}: {
  offers: Offer[];
  medicines: MedicineWithBatches[];
  categories: string[];
  onChanged: (message?: string) => void;
}) => {
  const [view, setView] = useState<"offers" | "analytics">("offers");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [usage, setUsage] = useState<Record<string, OfferUsage>>({});
  const today = todayIso();

  useEffect(() => {
    offerUsage()
      .then((res) => res.ok && setUsage(Object.fromEntries(res.data.map((u) => [u.offer_id, u]))))
      .catch(() => undefined);
  }, [offers]);

  const medName = useMemo(() => {
    const map = new Map(medicines.map((m) => [m.id, m.generic_name]));
    return (id: string | null) => (id ? (map.get(id) ?? "—") : "—");
  }, [medicines]);

  const describe = (o: Offer) => {
    const buys = o.buy_category ? `any ${o.buy_category}` : medName(o.buy_medicine_id);
    const reward =
      o.reward_mode === "percent" ? `at ${o.reward_value}% off` : o.reward_mode === "price" ? `at ₹${o.reward_value}/pack` : "free";
    if (o.type === "bill_gift") return `Bill of ${money(o.min_bill)} or more → ${o.reward_qty} × ${medName(o.reward_medicine_id)} free`;
    if (o.type === "price_off") {
      const off = o.off_mode === "percent" ? `${o.off_value}% off` : o.off_mode === "amount" ? `₹${o.off_value} off per pack` : `₹${o.off_value} per pack`;
      return `Buy ${o.buy_qty}+ × ${buys} → ${off}`;
    }
    const same = !o.buy_category && o.reward_medicine_id === o.buy_medicine_id;
    return `Buy ${o.buy_qty} × ${buys} → ${o.reward_qty} × ${same ? "same product" : medName(o.reward_medicine_id)} ${reward}${o.repeatable ? " (every time)" : " (once per bill)"}`;
  };

  const counts = useMemo(() => {
    const c: Record<OfferStatus, number> = { active: 0, scheduled: 0, expired: 0, off: 0 };
    for (const o of offers) c[offerStatus(o, today)] += 1;
    return c;
  }, [offers, today]);

  return (
    <div>
      <div className="mb-4 flex w-fit gap-1 rounded-xl border border-[#e5e7eb] bg-white p-1 shadow-sm">
        {([
          ["offers", "Offers", Gift],
          ["analytics", "Analytics & history", BarChart3],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-bold transition ${
              view === key ? "bg-[var(--c-deep)] text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {view === "analytics" ? (
        <OfferAnalytics offers={offers} medicines={medicines} counts={counts} />
      ) : (
        <Card className="p-5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-gray-900">
              <Gift className="h-[18px] w-[18px] text-[var(--c-deep)]" /> Offers &amp; Promotions
              <span className="text-[12px] font-medium text-gray-500">
                · {counts.active} active · {counts.scheduled} scheduled · {counts.expired} expired · {counts.off} off
              </span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TYPE_LABEL) as OfferType[]).map((t) => (
                <Button key={t} variant="ghost" className="py-2 text-[12.5px]" onClick={() => setDraft(blank(t))}>
                  <Plus className="h-4 w-4" /> {TYPE_LABEL[t]}
                </Button>
              ))}
            </div>
          </div>
          <p className="mb-4 text-[12px] leading-relaxed text-gray-500">
            Retail bills only. Offers apply by themselves when a bill qualifies (or wait for the counter to accept them,
            if set so). Free items are separate ₹0 lines marked FREE; discounted rewards and price offers show the offer on
            the line. Rewards come off stock and are only given when in stock. Quantities are in packs (strip / bottle /
            piece). Staff can use offers but only an admin can change them.
          </p>

          <div className="overflow-x-auto rounded-lg border border-[#e5e7eb]">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-[#f4f6f8] text-gray-700">
                  <th className="th">Offer</th>
                  <th className="th">What it does</th>
                  <th className="th">Valid</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Used</th>
                  <th className="th text-right">Value given</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f3f5]">
                {offers.map((o) => {
                  const st = STATUS[offerStatus(o, today)];
                  const u = usage[o.id];
                  return (
                    <tr key={o.id}>
                      <td className="td">
                        <p className="font-semibold text-gray-900">{o.name}</p>
                        <span className="mt-0.5 inline-block rounded bg-[var(--c-mint)] px-1.5 py-0.5 text-[10.5px] font-extrabold text-[var(--c-deep)]">
                          {offerBadge(o)}
                        </span>
                        {!o.auto_apply && <span className="ml-1 text-[10.5px] font-semibold text-amber-700">COUNTER APPLIES</span>}
                      </td>
                      <td className="td max-w-[340px] text-[12.5px] text-gray-700">
                        {describe(o)}
                        {(o.max_per_customer > 0 || o.max_total > 0 || o.max_free_per_bill > 0) && (
                          <span className="block text-[11px] text-gray-500">
                            Limits:{" "}
                            {[
                              o.max_free_per_bill ? `${o.max_free_per_bill}/bill` : "",
                              o.max_per_customer ? `${o.max_per_customer}/customer` : "",
                              o.max_total ? `${o.max_total} in all` : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </td>
                      <td className="td whitespace-nowrap text-[12.5px]">
                        {o.starts_on ? dateSlash(o.starts_on) : "Now"} – {o.ends_on ? dateSlash(o.ends_on) : "no end"}
                      </td>
                      <td className="td">
                        <Pill tone={st.tone}>{st.label}</Pill>
                      </td>
                      <td className="td text-right">{u?.bills ?? 0} bills</td>
                      <td className="td whitespace-nowrap text-right">₹{amount(u?.savings ?? 0)}</td>
                      <td className="td">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => setDraft(fromOffer(o))}
                            aria-label={`Edit ${o.name}`}
                            className="cursor-pointer rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-[var(--c-deep)]"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm(`Delete the offer "${o.name}"? Bills already made keep it.`)) return;
                              const res = await act(deleteOffer(o.id));
                              if (res.ok) onChanged("Offer deleted.");
                            }}
                            aria-label={`Delete ${o.name}`}
                            className="cursor-pointer rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!offers.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-[13px] text-gray-400">
                      No offers yet — add a Buy 1 Get 1, a free gift or a price offer above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {draft && (
        <OfferModal
          key={draft.id || draft.type}
          initial={draft}
          medicines={medicines}
          categories={categories}
          onClose={() => setDraft(null)}
          onSaved={(message) => {
            setDraft(null);
            onChanged(message);
          }}
        />
      )}
    </div>
  );
};

/* ------------------------------ analytics ------------------------------ */

const OfferAnalytics = ({
  offers,
  medicines,
  counts,
}: {
  offers: Offer[];
  medicines: MedicineWithBatches[];
  counts: Record<OfferStatus, number>;
}) => {
  const [filter, setFilter] = useState<{ period: Period; from: string; to: string }>({ period: "MONTH", from: "", to: "" });
  const [typeFilter, setTypeFilter] = useState<"" | OfferType>("");
  const [productFilter, setProductFilter] = useState("");
  const [rows, setRows] = useState<OfferRedemption[] | null>(null);
  const range = useMemo(() => periodRange(filter.period, filter.from, filter.to), [filter]);

  useEffect(() => {
    let live = true;
    offerHistory(range[0], range[1])
      .then((res) => live && setRows(res.ok ? res.data : []))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [range]);

  const byId = useMemo(() => new Map(offers.map((o) => [o.id, o])), [offers]);
  const shown = useMemo(
    () =>
      (rows ?? []).filter((r) => {
        const o = r.offer_id ? byId.get(r.offer_id) : undefined;
        if (typeFilter && (!o || o.type !== typeFilter)) return false;
        if (productFilter && r.medicine_id !== productFilter) return false;
        return true;
      }),
    [rows, byId, typeFilter, productFilter],
  );

  const stats = useMemo(() => {
    const per = new Map<string, { name: string; bills: Set<string>; units: number; value: number; sales: Map<string, number> }>();
    for (const r of shown) {
      const key = r.offer_id ?? r.offer_name;
      const s = per.get(key) ?? { name: r.offer_name, bills: new Set<string>(), units: 0, value: 0, sales: new Map<string, number>() };
      s.bills.add(r.bill_id);
      if (r.is_free) s.units += r.qty;
      s.value += r.value;
      s.sales.set(r.bill_id, r.bill_total);
      per.set(key, s);
    }
    const list = [...per.entries()].map(([id, s]) => ({
      id,
      name: s.name,
      redemptions: s.bills.size,
      units: s.units,
      value: Math.round(s.value * 100) / 100,
      sales: Math.round([...s.sales.values()].reduce((a, b) => a + b, 0) * 100) / 100,
    }));
    return {
      list: list.sort((a, b) => b.redemptions - a.redemptions),
      redemptions: list.reduce((s, x) => s + x.redemptions, 0),
      units: list.reduce((s, x) => s + x.units, 0),
      value: Math.round(list.reduce((s, x) => s + x.value, 0) * 100) / 100,
      mostUsed: [...list].sort((a, b) => b.redemptions - a.redemptions)[0],
      best: [...list].sort((a, b) => b.sales - a.sales)[0],
    };
  }, [shown]);

  const productsUsed = useMemo(() => {
    const ids = new Set((rows ?? []).map((r) => r.medicine_id));
    return medicines.filter((m) => ids.has(m.id)).sort((a, b) => a.generic_name.localeCompare(b.generic_name));
  }, [rows, medicines]);

  const exportHistory = () =>
    downloadExcel(
      [
        {
          name: "Offer redemptions",
          columns: [
            { header: "Date", width: 12 },
            { header: "Bill no", width: 10 },
            { header: "Customer", width: 22 },
            { header: "Offer", width: 26 },
            { header: "Product", width: 26 },
            { header: "Qty", width: 7 },
            { header: "Free", width: 7 },
            { header: "Offer value (₹)", width: 15 },
            { header: "Bill total (₹)", width: 14 },
          ],
          rows: shown.map((r) => [dateSlash(r.bill_date), r.bill_id, r.customer_name, r.offer_name, r.product, r.qty, r.is_free ? "Yes" : "", r.value, r.bill_total]),
        },
        {
          name: "Offer performance",
          columns: [
            { header: "Offer", width: 28 },
            { header: "Times used", width: 12 },
            { header: "Free units", width: 12 },
            { header: "Value given (₹)", width: 16 },
            { header: "Sales on those bills (₹)", width: 22 },
          ],
          rows: stats.list.map((s) => [s.name, s.redemptions, s.units, s.value, s.sales]),
        },
      ],
      `offers-${range[0]}-to-${range[1]}.xlsx`.replace(/0000-01-01|9999-12-31/g, "all"),
    );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <PeriodFilter period={filter.period} from={filter.from} to={filter.to} onChange={setFilter} />
        <Field label="Type" className="w-[220px]">
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "" | OfferType)}>
            <option value="">All types</option>
            {(Object.keys(TYPE_LABEL) as OfferType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Product" className="w-[220px]">
          <Select value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
            <option value="">All products</option>
            {productsUsed.map((m) => (
              <option key={m.id} value={m.id}>
                {m.generic_name}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="ghost" className="py-2 text-[13px]" onClick={exportHistory} disabled={!shown.length}>
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Active / scheduled / expired", `${counts.active} / ${counts.scheduled} / ${counts.expired}`],
          ["Times offers were used", String(stats.redemptions)],
          ["Free units given", String(stats.units)],
          ["Value given (MRP of free + offer discounts)", money(stats.value)],
          ["Most used", stats.mostUsed ? `${stats.mostUsed.name} (${stats.mostUsed.redemptions})` : "—"],
          ["Best performing (sales on its bills)", stats.best ? `${stats.best.name} · ${money(stats.best.sales)}` : "—"],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-[12px] text-gray-500">{label}</p>
            <p className="mt-1 truncate text-[17px] font-extrabold text-gray-900">{value}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-4 overflow-hidden">
        <p className="border-b border-[#eef1f3] px-4 py-3 text-[14px] font-bold text-gray-900">Offer performance</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-[#fafbfc] text-gray-600">
                <th className="th">Offer</th>
                <th className="th text-right">Times used</th>
                <th className="th text-right">Free units</th>
                <th className="th text-right">Value given</th>
                <th className="th text-right">Sales on those bills</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f3f5]">
              {stats.list.map((s) => (
                <tr key={s.id}>
                  <td className="td font-semibold text-gray-900">{s.name}</td>
                  <td className="td text-right">{s.redemptions}</td>
                  <td className="td text-right">{s.units}</td>
                  <td className="td text-right">{money(s.value)}</td>
                  <td className="td text-right font-semibold">{money(s.sales)}</td>
                </tr>
              ))}
              {!stats.list.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[13px] text-gray-400">
                    {rows === null ? "Loading…" : "No offers used in this period."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <p className="border-b border-[#eef1f3] px-4 py-3 text-[14px] font-bold text-gray-900">
          Redemption history {shown.length > 200 && <span className="text-[12px] font-medium text-gray-500">(latest 200 — export for all)</span>}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="bg-[#fafbfc] text-gray-600">
                <th className="th">Date</th>
                <th className="th">Bill</th>
                <th className="th">Customer</th>
                <th className="th">Offer</th>
                <th className="th">Product</th>
                <th className="th text-right">Qty</th>
                <th className="th text-right">Offer value</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f3f5]">
              {shown.slice(0, 200).map((r, i) => (
                <tr key={`${r.bill_id}-${i}`}>
                  <td className="td whitespace-nowrap">{dateSlash(r.bill_date)}</td>
                  <td className="td font-semibold">{r.bill_id}</td>
                  <td className="td">{r.customer_name}</td>
                  <td className="td">{r.offer_name}</td>
                  <td className="td">
                    {r.product}
                    {r.is_free && <span className="ml-1.5 rounded bg-[#16a34a] px-1 py-0.5 text-[10px] font-extrabold text-white">FREE</span>}
                  </td>
                  <td className="td text-right">{r.qty}</td>
                  <td className="td text-right">{money(r.value)}</td>
                  <td className="td">
                    <button
                      onClick={() => window.open(`/invoice/${encodeURIComponent(r.bill_id)}`, "_blank")}
                      className="cursor-pointer whitespace-nowrap rounded-md border border-[#d8dde3] px-2.5 py-1 text-[12px] font-semibold text-[var(--c-deep)] hover:bg-gray-50"
                    >
                      Invoice
                    </button>
                  </td>
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[13px] text-gray-400">
                    {rows === null ? "Loading…" : "Nothing in this period."}
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

/* -------------------------------- editor -------------------------------- */

const Check = ({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) => (
  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#e5e7eb] px-3 py-2.5 text-[13px] font-medium text-gray-800">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--c-primary)]" />
    {children}
  </label>
);

const OfferModal = ({
  initial,
  medicines,
  categories,
  onClose,
  onSaved,
}: {
  initial: Draft;
  medicines: MedicineWithBatches[];
  categories: string[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) => {
  const [d, setD] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });
  const sorted = useMemo(() => [...medicines].sort((a, b) => a.generic_name.localeCompare(b.generic_name)), [medicines]);
  const productSelect = (value: string, onChange: (id: string) => void) => (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Choose product —</option>
      {sorted.map((m) => (
        <option key={m.id} value={m.id}>
          {m.generic_name}
          {m.batches[0]?.brand_name ? ` · ${m.batches[0].brand_name}` : ""} ({m.total_stock} in stock)
        </option>
      ))}
    </Select>
  );
  const isGift = d.type === "bill_gift";
  const isPrice = d.type === "price_off";
  const byCategory = !isGift && d.target === "category";

  const save = async () => {
    setSaving(true);
    const res = await act(
      saveOffer({
        ...d,
        buy_medicine_id: byCategory ? "" : d.buy_medicine_id,
        buy_category: byCategory ? d.buy_category : "",
        reward_medicine_id: d.type === "buy_get" && d.reward_same && !byCategory ? d.buy_medicine_id : d.reward_medicine_id,
        buy_qty: Number(d.buy_qty),
        reward_qty: Number(d.reward_qty),
        reward_value: Number(d.reward_value || 0),
        off_value: Number(d.off_value || 0),
        min_bill: Number(d.min_bill || 0),
        max_free_per_bill: Number(d.max_free_per_bill || 0),
        max_per_customer: Number(d.max_per_customer || 0),
        max_total: Number(d.max_total || 0),
        priority: Number(d.priority || 0),
      }),
    );
    setSaving(false);
    if (res.ok) onSaved(d.id ? "Offer updated." : "Offer created — it applies on retail bills from its start date.");
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={d.id ? "Edit offer" : `New offer · ${TYPE_LABEL[d.type]}`}
      subtitle="Retail bills · quantities are in packs (strip / bottle / piece)"
      width="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save offer"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Offer name">
          <TextInput value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Vitamin C Buy 1 Get 1" />
        </Field>
        <Field label="Offer type">
          <Select value={d.type} onChange={(e) => set({ type: e.target.value as OfferType })}>
            {(Object.keys(TYPE_LABEL) as OfferType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>

        {!isGift && (
          <>
            <Field label="Applies to">
              <Select value={d.target} onChange={(e) => set({ target: e.target.value as Draft["target"] })}>
                <option value="product">One product</option>
                <option value="category">Any product in a category</option>
              </Select>
            </Field>
            <Field label={byCategory ? "Category" : "Product bought"}>
              {byCategory ? (
                <Select value={d.buy_category} onChange={(e) => set({ buy_category: e.target.value })}>
                  <option value="">— Choose category —</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              ) : (
                productSelect(d.buy_medicine_id, (id) => set({ buy_medicine_id: id }))
              )}
            </Field>
            <Field label={isPrice ? "At least (packs)" : "Packs to buy"}>
              <TextInput type="number" value={d.buy_qty} onChange={(e) => set({ buy_qty: e.target.value })} />
            </Field>
          </>
        )}

        {isGift && (
          <Field label="Bill amount of at least (₹)" hint="Before automatic discounts">
            <TextInput type="number" value={d.min_bill} onChange={(e) => set({ min_bill: e.target.value })} placeholder="1000" />
          </Field>
        )}

        {isPrice ? (
          <>
            <Field label="Offer">
              <Select value={d.off_mode} onChange={(e) => set({ off_mode: e.target.value as Draft["off_mode"] })}>
                <option value="percent">% off</option>
                <option value="amount">₹ off per pack</option>
                <option value="price">Promotional price per pack</option>
              </Select>
            </Field>
            <Field label={d.off_mode === "percent" ? "% off" : d.off_mode === "amount" ? "₹ off per pack" : "Price per pack (₹)"}>
              <TextInput type="number" value={d.off_value} onChange={(e) => set({ off_value: e.target.value })} />
            </Field>
          </>
        ) : (
          <>
            <Field label={isGift ? "Gift product" : "Reward product"}>
              {!isGift && !byCategory && (
                <label className="mb-2 flex cursor-pointer items-center gap-2 text-[13px] font-medium text-gray-800">
                  <input
                    type="checkbox"
                    checked={d.reward_same}
                    onChange={(e) => set({ reward_same: e.target.checked })}
                    className="h-4 w-4 accent-[var(--c-primary)]"
                  />
                  Same product (Buy 1 Get 1 style)
                </label>
              )}
              {(isGift || byCategory || !d.reward_same) && productSelect(d.reward_medicine_id, (id) => set({ reward_medicine_id: id }))}
            </Field>
            <Field label="Staff may give instead" hint="Optional — the counter picks one of these on the bill">
              <div className="flex flex-wrap gap-1.5">
                {d.reward_choices.map((id) => (
                  <span key={id} className="flex items-center gap-1 rounded-md border border-[#e3e7ea] bg-[#fafbfc] py-1 pl-2 pr-1 text-[12px] font-semibold">
                    {sorted.find((m) => m.id === id)?.generic_name ?? "Product"}
                    <button
                      onClick={() => set({ reward_choices: d.reward_choices.filter((x) => x !== id) })}
                      aria-label="Remove"
                      className="cursor-pointer rounded p-0.5 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <Select
                value=""
                onChange={(e) => e.target.value && set({ reward_choices: [...new Set([...d.reward_choices, e.target.value])] })}
                className="mt-1.5"
              >
                <option value="">+ Add a product</option>
                {sorted
                  .filter((m) => !d.reward_choices.includes(m.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.generic_name} ({m.total_stock} in stock)
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Reward packs">
              <TextInput type="number" value={d.reward_qty} onChange={(e) => set({ reward_qty: e.target.value })} />
            </Field>
            {!isGift && (
              <>
                <Field label="Reward is">
                  <Select value={d.reward_mode} onChange={(e) => set({ reward_mode: e.target.value as Draft["reward_mode"] })}>
                    <option value="free">Free</option>
                    <option value="percent">At a % off</option>
                    <option value="price">At a promotional price per pack</option>
                  </Select>
                </Field>
                {d.reward_mode !== "free" && (
                  <Field label={d.reward_mode === "percent" ? "% off the reward" : "Reward price per pack (₹)"}>
                    <TextInput type="number" value={d.reward_value} onChange={(e) => set({ reward_value: e.target.value })} />
                  </Field>
                )}
              </>
            )}
          </>
        )}

        {d.type === "buy_get" && (
          <Field label="Repeat">
            <Check checked={d.repeatable} onChange={(v) => set({ repeatable: v })}>
              Give again for every further set bought
            </Check>
          </Field>
        )}
        <Field label="Starts on">
          <TextInput type="date" value={d.starts_on} onChange={(e) => set({ starts_on: e.target.value })} />
        </Field>
        <Field label="Ends on" hint="Blank = no end date">
          <TextInput type="date" value={d.ends_on} onChange={(e) => set({ ends_on: e.target.value })} />
        </Field>
        {!isPrice && (
          <Field label="Most reward packs per bill" hint="Blank = no limit">
            <TextInput type="number" value={d.max_free_per_bill} onChange={(e) => set({ max_free_per_bill: e.target.value })} />
          </Field>
        )}
        <Field label="Times per customer" hint="Blank = no limit · needs the customer on the bill">
          <TextInput type="number" value={d.max_per_customer} onChange={(e) => set({ max_per_customer: e.target.value })} />
        </Field>
        <Field label="Times in all" hint="Blank = no limit (1 = one-time offer)">
          <TextInput type="number" value={d.max_total} onChange={(e) => set({ max_total: e.target.value })} />
        </Field>
        <Field label="Priority" hint="Tried first when offers compete for the same items">
          <TextInput type="number" value={d.priority} onChange={(e) => set({ priority: e.target.value })} />
        </Field>
        <Field label="How it applies">
          <Check checked={d.auto_apply} onChange={(v) => set({ auto_apply: v })}>
            Automatically (off = the counter taps Apply)
          </Check>
        </Field>
        {!isGift && (
          <Field label="With the automatic discount">
            <Check checked={d.stack_auto} onChange={(v) => set({ stack_auto: v })}>
              Also give the category discount on discounted items (never on free ones)
            </Check>
          </Field>
        )}
        <Field label="Status">
          <Check checked={d.active} onChange={(v) => set({ active: v })}>
            Offer is on
          </Check>
        </Field>
        <Field label="Note (optional)">
          <TextInput value={d.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};
