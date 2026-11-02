"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Gift, Pencil, Plus, Save, Trash2 } from "lucide-react";
import type { MedicineWithBatches } from "@/lib/types";
import { offerBadge, offerStatus, type Offer, type OfferStatus } from "@/lib/offers";
import { deleteOffer, offerUsage, saveOffer, type OfferUsage } from "@/lib/actions";
import { amount, dateSlash, money, packNoun, todayIso } from "@/lib/format";
import { Button, Card, Field, Modal, Pill, Select, TextInput } from "./ui";
import { act } from "./mode-context";

/* ------------------------------------------------------------------------
   Settings → Offers (retail): Buy X Get Y, free gifts with a product and
   free gifts above a bill amount. See lib/offers.ts for how they apply.
   ------------------------------------------------------------------------ */

const STATUS: Record<OfferStatus, { label: string; tone: "green" | "blue" | "gray" | "amber" }> = {
  active: { label: "ACTIVE", tone: "green" },
  scheduled: { label: "SCHEDULED", tone: "blue" },
  expired: { label: "EXPIRED", tone: "gray" },
  off: { label: "OFF", tone: "amber" },
};

type Draft = {
  id?: string;
  name: string;
  description: string;
  type: Offer["type"];
  buy_medicine_id: string;
  buy_qty: string;
  reward_same: boolean;
  reward_medicine_id: string;
  reward_qty: string;
  min_bill: string;
  repeatable: boolean;
  max_free_per_bill: string;
  starts_on: string;
  ends_on: string;
  active: boolean;
  priority: string;
};

const blank = (type: Offer["type"]): Draft => ({
  name: "",
  description: "",
  type,
  buy_medicine_id: "",
  buy_qty: "1",
  reward_same: type === "buy_get",
  reward_medicine_id: "",
  reward_qty: "1",
  min_bill: "",
  repeatable: true,
  max_free_per_bill: "",
  starts_on: todayIso(),
  ends_on: "",
  active: true,
  priority: "0",
});

const fromOffer = (o: Offer): Draft => ({
  id: o.id,
  name: o.name,
  description: o.description,
  type: o.type,
  buy_medicine_id: o.buy_medicine_id ?? "",
  buy_qty: String(o.buy_qty),
  reward_same: o.type === "buy_get" && o.reward_medicine_id === o.buy_medicine_id,
  reward_medicine_id: o.reward_medicine_id,
  reward_qty: String(o.reward_qty),
  min_bill: o.min_bill ? String(o.min_bill) : "",
  repeatable: o.repeatable,
  max_free_per_bill: o.max_free_per_bill ? String(o.max_free_per_bill) : "",
  starts_on: o.starts_on,
  ends_on: o.ends_on,
  active: o.active,
  priority: String(o.priority),
});

export const OffersSettings = ({
  offers,
  medicines,
  onChanged,
}: {
  offers: Offer[];
  medicines: MedicineWithBatches[];
  onChanged: (message?: string) => void;
}) => {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [usage, setUsage] = useState<Record<string, OfferUsage>>({});
  const today = todayIso();

  useEffect(() => {
    offerUsage()
      .then((res) => res.ok && setUsage(Object.fromEntries(res.data.map((u) => [u.offer_id, u]))))
      .catch(() => undefined);
  }, [offers]);

  const medName = useMemo(() => {
    const map = new Map(medicines.map((m) => [m.id, m]));
    return (id: string | null) => {
      const m = id ? map.get(id) : null;
      return m ? `${m.generic_name}${m.active_batch ? ` (${packNoun(m.active_batch.purchase_unit_type).replace(/s$/, "").toLowerCase()})` : ""}` : "—";
    };
  }, [medicines]);

  const totals = useMemo(() => {
    const list = Object.values(usage);
    return {
      redemptions: list.reduce((s, u) => s + u.bills, 0),
      units: list.reduce((s, u) => s + u.free_units, 0),
      savings: list.reduce((s, u) => s + u.savings, 0),
    };
  }, [usage]);

  const describe = (o: Offer) =>
    o.type === "bill_gift"
      ? `Bill of ${money(o.min_bill)} or more → ${o.reward_qty} × ${medName(o.reward_medicine_id)} free`
      : `Buy ${o.buy_qty} × ${medName(o.buy_medicine_id)} → ${o.reward_qty} × ${
          o.reward_medicine_id === o.buy_medicine_id ? "same product" : medName(o.reward_medicine_id)
        } free${o.repeatable ? " (every time)" : " (once per bill)"}`;

  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        {[
          ["Active offers", String(offers.filter((o) => offerStatus(o, today) === "active").length)],
          ["Times used", String(totals.redemptions)],
          ["Free items given", `${totals.units} units`],
          ["Value given free (MRP)", money(totals.savings)],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-[12px] text-gray-500">{label}</p>
            <p className="mt-1 text-[20px] font-extrabold text-gray-900">{value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-gray-900">
            <Gift className="h-[18px] w-[18px] text-[var(--c-deep)]" /> Offers &amp; Free Gifts
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" className="py-2 text-[13px]" onClick={() => setDraft(blank("buy_get"))}>
              <Plus className="h-4 w-4" /> Buy X Get Y / gift with product
            </Button>
            <Button variant="ghost" className="py-2 text-[13px]" onClick={() => setDraft(blank("bill_gift"))}>
              <Plus className="h-4 w-4" /> Gift above a bill amount
            </Button>
          </div>
        </div>
        <p className="mb-4 text-[12px] leading-relaxed text-gray-500">
          Retail bills only. When a bill qualifies, the free item is added by itself as a separate ₹0 line marked FREE
          and comes off stock. It is only given when in stock. Quantities are in packs (strip / bottle / piece). Free items
          get no automatic discount and don&rsquo;t count towards the bill amount.
        </p>

        <div className="overflow-x-auto rounded-lg border border-[#e5e7eb]">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="bg-[#f4f6f8] text-gray-700">
                <th className="th">Offer</th>
                <th className="th">What it gives</th>
                <th className="th">Valid</th>
                <th className="th">Status</th>
                <th className="th text-right">Used</th>
                <th className="th text-right">Given free</th>
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
                    </td>
                    <td className="td max-w-[320px] text-[12.5px] text-gray-700">{describe(o)}</td>
                    <td className="td whitespace-nowrap text-[12.5px]">
                      {o.starts_on ? dateSlash(o.starts_on) : "Now"} – {o.ends_on ? dateSlash(o.ends_on) : "no end"}
                    </td>
                    <td className="td">
                      <Pill tone={st.tone}>{st.label}</Pill>
                    </td>
                    <td className="td text-right">{u?.bills ?? 0} bills</td>
                    <td className="td whitespace-nowrap text-right">
                      {u?.free_units ?? 0} units · ₹{amount(u?.savings ?? 0)}
                    </td>
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
                    No offers yet — add a Buy 1 Get 1 or a free gift above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {draft && (
        <OfferModal
          key={draft.id || draft.type}
          initial={draft}
          medicines={medicines}
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

const OfferModal = ({
  initial,
  medicines,
  onClose,
  onSaved,
}: {
  initial: Draft;
  medicines: MedicineWithBatches[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) => {
  const [d, setD] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });
  const isGift = d.type === "bill_gift";
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

  const save = async () => {
    setSaving(true);
    const res = await act(
      saveOffer({
        ...d,
        reward_medicine_id: !isGift && d.reward_same ? d.buy_medicine_id : d.reward_medicine_id,
        buy_qty: Number(d.buy_qty),
        reward_qty: Number(d.reward_qty),
        min_bill: Number(d.min_bill),
        max_free_per_bill: Number(d.max_free_per_bill || 0),
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
      title={d.id ? "Edit offer" : isGift ? "New gift above a bill amount" : "New Buy X Get Y / gift with product"}
      subtitle="Retail bills · quantities are in packs (strip / bottle / piece)"
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
        <Field label="Offer name" className="sm:col-span-2">
          <TextInput
            value={d.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder={isGift ? "e.g. Free mask on ₹1000+ bills" : "e.g. Vitamin C Buy 1 Get 1"}
          />
        </Field>
        {!isGift ? (
          <>
            <Field label="Customer buys">{productSelect(d.buy_medicine_id, (id) => set({ buy_medicine_id: id }))}</Field>
            <Field label="How many packs">
              <TextInput type="number" value={d.buy_qty} onChange={(e) => set({ buy_qty: e.target.value })} />
            </Field>
            <Field label="Free item">
              <label className="mb-2 flex cursor-pointer items-center gap-2 text-[13px] font-medium text-gray-800">
                <input
                  type="checkbox"
                  checked={d.reward_same}
                  onChange={(e) => set({ reward_same: e.target.checked })}
                  className="h-4 w-4 accent-[var(--c-primary)]"
                />
                Same product (Buy 1 Get 1 style)
              </label>
              {!d.reward_same && productSelect(d.reward_medicine_id, (id) => set({ reward_medicine_id: id }))}
            </Field>
          </>
        ) : (
          <>
            <Field label="Bill amount of at least (₹)" hint="Before automatic discounts">
              <TextInput type="number" value={d.min_bill} onChange={(e) => set({ min_bill: e.target.value })} placeholder="1000" />
            </Field>
            <Field label="Free gift">{productSelect(d.reward_medicine_id, (id) => set({ reward_medicine_id: id }))}</Field>
          </>
        )}
        <Field label="Free packs">
          <TextInput type="number" value={d.reward_qty} onChange={(e) => set({ reward_qty: e.target.value })} />
        </Field>
        {!isGift && (
          <Field label="Repeat">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#e5e7eb] px-3 py-2.5 text-[13px] font-medium text-gray-800">
              <input
                type="checkbox"
                checked={d.repeatable}
                onChange={(e) => set({ repeatable: e.target.checked })}
                className="h-4 w-4 accent-[var(--c-primary)]"
              />
              Give again for every further set bought (Buy 2 → 2 free)
            </label>
          </Field>
        )}
        <Field label="Most free packs per bill" hint="Blank = no limit">
          <TextInput type="number" value={d.max_free_per_bill} onChange={(e) => set({ max_free_per_bill: e.target.value })} />
        </Field>
        <Field label="Starts on">
          <TextInput type="date" value={d.starts_on} onChange={(e) => set({ starts_on: e.target.value })} />
        </Field>
        <Field label="Ends on" hint="Blank = no end date">
          <TextInput type="date" value={d.ends_on} onChange={(e) => set({ ends_on: e.target.value })} />
        </Field>
        <Field label="Priority" hint="When two offers are on the same product, the higher one applies">
          <TextInput type="number" value={d.priority} onChange={(e) => set({ priority: e.target.value })} />
        </Field>
        <Field label="Status">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#e5e7eb] px-3 py-2.5 text-[13px] font-medium text-gray-800">
            <input
              type="checkbox"
              checked={d.active}
              onChange={(e) => set({ active: e.target.checked })}
              className="h-4 w-4 accent-[var(--c-primary)]"
            />
            Offer is on
          </label>
        </Field>
        <Field label="Note (optional)" className="sm:col-span-2">
          <TextInput value={d.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};
