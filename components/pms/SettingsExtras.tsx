"use client";

import React, { useMemo, useState } from "react";
import { Save, Plus, Trash2, GitMerge, Pencil } from "lucide-react";
import type { ActionResult, BillOffer, DiscountTier, ModeSettings, PaymentMethod } from "@/lib/types";
import { MODE_LABEL, type Mode } from "@/lib/mode";
import { amount, monthShort } from "@/lib/format";
import {
  classifyLegacyRecords,
  deleteUser,
  getLoginPasscodeStatus,
  listUsers,
  resetLoginPasscode,
  saveInvoicePromo,
  savePurchaseUnits,
  saveProductTypes,
  saveTypeDiscounts,
  saveModeSettings,
  saveUser,
  type AppUser,
} from "@/lib/actions";
import { Button, Card, Field, Modal, Pill, Select, TextInput } from "./ui";
import { act, useMode, useModeState } from "./mode-context";
import { useReconciliation } from "./data";
import { PromoCard } from "./InvoicePromoPopup";
import type { TypeDiscountRule } from "@/lib/type-discounts";
import { productTypeOptions } from "@/lib/product-types";
import { normalisePromo, type InvoicePromo, type PromoGroup, type PromoRow } from "@/lib/promo";

const ALL_METHODS: PaymentMethod[] = ["Cash", "UPI", "Card", "Bank Transfer", "Cheque"];
type Draft = {
  invoice_prefix: string;
  payment_methods: PaymentMethod[];
  allow_credit: boolean;
  default_credit_days: string;
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
    max_discount_percent: String(settings.max_discount_percent || ""),
    enforce_moq: settings.enforce_moq,
    invoice_terms: settings.invoice_terms,
  }));
  const [tiers, setTiers] = useState<DiscountTier[]>(settings.bulk_discount_tiers);
  const [offers, setOffers] = useState<BillOffer[]>(settings.bill_offers);
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
        bill_offers: offers,
      }),
    );
    setSaving(false);
    if (res.ok) onChanged(`${MODE_LABEL[mode]} settings saved.`);
  };

  return (
    <Card className="mt-4 p-5">
      <h3 className="mb-1 text-[15px] font-bold text-gray-900">{MODE_LABEL[mode]} Settings</h3>
      <p className="mb-4 text-[12px] text-gray-500">
        These apply to the {mode} dashboard only. The other dashboard keeps its own. Shop details, GSTIN,
        drug licence and stock &amp; tax defaults for {mode} are in the Shop Details card above.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      <Field
        label="Automatic bill offers"
        className="mt-4"
        hint="Applied by itself at billing once the bill total reaches the amount. If several match, the biggest % is given."
      >
        <div className="space-y-2">
          {offers.map((o, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-[13px] text-gray-700">
              <span>Bill of ₹</span>
              <TextInput
                type="number"
                value={o.min_amount || ""}
                onChange={(e) =>
                  setOffers(offers.map((x, n) => (n === i ? { ...x, min_amount: Number(e.target.value) || 0 } : x)))
                }
                placeholder="600"
                className="w-[110px]"
              />
              <span>or more →</span>
              <TextInput
                type="number"
                value={o.percent || ""}
                onChange={(e) =>
                  setOffers(offers.map((x, n) => (n === i ? { ...x, percent: Number(e.target.value) || 0 } : x)))
                }
                placeholder="5"
                className="w-[80px]"
              />
              <span>% off</span>
              <button
                onClick={() => setOffers(offers.filter((_, n) => n !== i))}
                aria-label="Remove offer"
                className="cursor-pointer rounded-md p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button variant="ghost" className="py-2 text-[13px]" onClick={() => setOffers([...offers, { min_amount: 0, percent: 0 }])}>
            <Plus className="h-4 w-4" /> Add offer
          </Button>
        </div>
      </Field>

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
          placeholder={"Please check your bill, product expiry, quantity and batch before leaving.\nProduct replacement within 7 days."}
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

/* ------------------------------------------------------------------------
   Product types — Tablet, Injection, Cartridge… offered on every medicine.
   ------------------------------------------------------------------------ */

export const ProductTypesCard = ({ types, onChanged }: { types: string[]; onChanged: (message?: string) => void }) => (
  <NameListCard
    title="Product Types"
    description="Choose one for each medicine (Inventory or Purchase). It prints in the Type column of bills and invoices. Shared by retail and wholesale."
    placeholder="New type, e.g. Syrup"
    initial={types}
    save={saveProductTypes}
    savedMessage="Product types saved."
    onChanged={onChanged}
  />
);

export const PurchaseUnitsCard = ({ units, onChanged }: { units: string[]; onChanged: (message?: string) => void }) => (
  <NameListCard
    title="Purchase Units"
    description="What a batch is bought in — chosen in Purchase and Inventory, with the units per pack beside it. Shared by retail and wholesale."
    placeholder="New unit, e.g. Tube, Vial"
    initial={units}
    save={savePurchaseUnits}
    savedMessage="Purchase units saved."
    onChanged={onChanged}
  />
);

/** An editable list of names saved shop-wide (product types, purchase units). */
const NameListCard = ({
  title,
  description,
  placeholder,
  initial,
  save: saveList,
  savedMessage,
  onChanged,
}: {
  title: string;
  description: string;
  placeholder: string;
  initial: string[];
  save: (list: string[]) => Promise<ActionResult<string[]>>;
  savedMessage: string;
  onChanged: (message?: string) => void;
}) => {
  const [types, setTypes] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    if (!types.some((t) => t.toLowerCase() === name.toLowerCase())) setTypes([...types, name]);
    setDraft("");
  };

  const save = async () => {
    setSaving(true);
    const res = await act(saveList(types));
    setSaving(false);
    if (res.ok) {
      setTypes(res.data);
      onChanged(savedMessage);
    }
  };

  return (
    <Card className="mt-4 p-5">
      <h3 className="mb-1 text-[15px] font-bold text-gray-900">{title}</h3>
      <p className="mb-4 text-[12px] text-gray-500">{description}</p>
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <span
            key={t}
            className="flex items-center gap-1.5 rounded-lg border border-[#e3e7ea] bg-[#fafbfc] py-1.5 pl-3 pr-1.5 text-[13px] font-semibold text-gray-800"
          >
            {t}
            <button
              onClick={() => setTypes(types.filter((x) => x !== t))}
              aria-label={`Remove ${t}`}
              className="cursor-pointer rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={placeholder}
          className="max-w-[240px]"
        />
        <Button variant="ghost" className="py-2 text-[13px]" onClick={add}>
          <Plus className="h-4 w-4" /> Add
        </Button>
        <Button className="ml-auto py-2 text-[13px]" onClick={save} disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
};

/* ------------------------------------------------------------------------
   Product-type discounts — automatic % off at billing, banded by how much
   of that product type is on the bill.
   ------------------------------------------------------------------------ */

type BandDraft = { from: string; to: string; percent: string };
type RuleDraft = { type: string; bands: BandDraft[] };

const toDraft = (rules: TypeDiscountRule[]): RuleDraft[] =>
  rules.map((r) => ({
    type: r.type,
    bands: r.bands.map((b) => ({ from: String(b.from), to: b.to ? String(b.to) : "", percent: String(b.percent) })),
  }));

export const TypeDiscountsCard = ({
  settings,
  productTypes,
  onChanged,
}: {
  settings: ModeSettings;
  productTypes: string[];
  onChanged: (message?: string) => void;
}) => {
  const mode = useMode();
  const [rules, setRules] = useState<RuleDraft[]>(() => toDraft(settings.type_discounts));
  const [saving, setSaving] = useState(false);

  const setRule = (ri: number, patch: Partial<RuleDraft>) => setRules(rules.map((r, i) => (i === ri ? { ...r, ...patch } : r)));
  const setBand = (ri: number, bi: number, patch: Partial<BandDraft>) =>
    setRule(ri, { bands: rules[ri].bands.map((b, i) => (i === bi ? { ...b, ...patch } : b)) });
  const unused = productTypes.filter((t) => !rules.some((r) => r.type.toLowerCase() === t.toLowerCase()));

  const save = async () => {
    setSaving(true);
    const payload = rules.map((r) => ({
      type: r.type,
      bands: r.bands.map((b) => ({ from: Number(b.from) || 0, to: Number(b.to) || 0, percent: Number(b.percent) || 0 })),
    }));
    const res = await act(saveTypeDiscounts(mode, payload));
    setSaving(false);
    if (res.ok) onChanged("Product-type discounts saved. New bills use them straight away.");
  };

  return (
    <Card className="mt-4 p-5">
      <h3 className="mb-1 text-[15px] font-bold text-gray-900">Product-type Discounts</h3>
      <p className="mb-4 text-[12px] text-gray-500">
        Applied automatically when you bill on the {mode} dashboard. The lines of each product type on a bill are added
        up; that total picks one band and its % comes off those lines. &ldquo;Up to&rdquo; is not included (₹999 – ₹6999
        means ₹999.00 to ₹6998.99); leave it blank for no upper limit.
      </p>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {rules.map((rule, ri) => (
          <div key={ri} className="rounded-lg border border-[#e5e7eb] p-3">
            <div className="mb-2 flex items-center gap-2">
              <Select value={rule.type} onChange={(e) => setRule(ri, { type: e.target.value })} className="font-semibold">
                {productTypeOptions(productTypes, rule.type).map((t) => (
                  <option key={t} value={t} disabled={t !== rule.type && rules.some((r) => r.type === t)}>
                    {t}
                  </option>
                ))}
              </Select>
              <button
                onClick={() => setRules(rules.filter((_, i) => i !== ri))}
                aria-label="Remove product type"
                className="cursor-pointer rounded-md p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-1 grid grid-cols-[1fr_1fr_80px_32px] gap-2 text-[11px] font-semibold text-gray-500">
              <span>From ₹</span>
              <span>Up to ₹</span>
              <span>% off</span>
              <span />
            </div>
            <div className="space-y-1.5">
              {rule.bands.map((band, bi) => (
                <div key={bi} className="grid grid-cols-[1fr_1fr_80px_32px] items-center gap-2">
                  <TextInput type="number" value={band.from} onChange={(e) => setBand(ri, bi, { from: e.target.value })} placeholder="0" />
                  <TextInput type="number" value={band.to} onChange={(e) => setBand(ri, bi, { to: e.target.value })} placeholder="No limit" />
                  <TextInput type="number" value={band.percent} onChange={(e) => setBand(ri, bi, { percent: e.target.value })} placeholder="10" />
                  <button
                    onClick={() => setRule(ri, { bands: rule.bands.filter((_, i) => i !== bi) })}
                    aria-label="Remove band"
                    className="cursor-pointer rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                const last = rule.bands.at(-1);
                setRule(ri, { bands: [...rule.bands, { from: last?.to || "", to: "", percent: "" }] });
              }}
              className="mt-2 flex cursor-pointer items-center gap-1 text-[12px] font-semibold text-[var(--c-deep)] hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add band
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          className="py-2 text-[13px]"
          disabled={!unused.length}
          onClick={() => setRules([...rules, { type: unused[0], bands: [{ from: "0", to: "", percent: "" }] }])}
        >
          <Plus className="h-4 w-4" /> Add product type
        </Button>
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save discounts"}
        </Button>
      </div>
    </Card>
  );
};

/* ------------------------------------------------------------------------
   Invoice offer pop-up — shown to customers who open their invoice link.
   ------------------------------------------------------------------------ */

export const InvoicePromoCard = ({
  settings,
  shopName,
  onChanged,
}: {
  settings: ModeSettings;
  shopName: string;
  onChanged: (message?: string) => void;
}) => {
  const mode = useMode();
  const [promo, setPromo] = useState<InvoicePromo>(settings.invoice_promo);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const patch = (p: Partial<InvoicePromo>) => setPromo({ ...promo, ...p });
  const setGroup = (gi: number, g: Partial<PromoGroup>) =>
    patch({ groups: promo.groups.map((x, i) => (i === gi ? { ...x, ...g } : x)) });
  const setRow = (gi: number, ri: number, r: Partial<PromoRow>) =>
    setGroup(gi, { rows: promo.groups[gi].rows.map((x, i) => (i === ri ? { ...x, ...r } : x)) });

  const save = async () => {
    setSaving(true);
    const res = await act(saveInvoicePromo(mode, promo));
    setSaving(false);
    if (res.ok) onChanged(promo.enabled ? "Offer pop-up saved and switched on." : "Offer pop-up saved (switched off).");
  };

  return (
    <Card className="mt-4 p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[15px] font-bold text-gray-900">Invoice Offer Pop-up</h3>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-gray-800">
          <input
            type="checkbox"
            checked={promo.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
            className="h-4 w-4 accent-[var(--c-primary)]"
          />
          Show to customers
        </label>
      </div>
      <p className="mb-4 text-[12px] text-gray-500">
        Pops up when a customer opens the {mode} invoice link you send them on WhatsApp. They close it with ✕. Staff
        never see it and it is not printed.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_120px]">
        <Field label="Big title">
          <TextInput value={promo.title} onChange={(e) => patch({ title: e.target.value })} placeholder="OFFERS" />
        </Field>
        <Field label="Line under the title">
          <TextInput value={promo.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} />
        </Field>
        <Field label="Card colour">
          <input
            type="color"
            value={promo.color}
            onChange={(e) => patch({ color: e.target.value })}
            className="h-[42px] w-full cursor-pointer rounded-lg border border-[#d8dde3] bg-white p-1"
          />
        </Field>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {promo.groups.map((group, gi) => (
          <div key={gi} className="rounded-lg border border-[#e5e7eb] p-3">
            <div className="mb-2 flex items-center gap-2">
              <TextInput
                value={group.heading}
                onChange={(e) => setGroup(gi, { heading: e.target.value })}
                placeholder="Heading, e.g. Tablets"
                className="font-semibold"
              />
              <button
                onClick={() => patch({ groups: promo.groups.filter((_, i) => i !== gi) })}
                aria-label="Remove section"
                className="cursor-pointer rounded-md p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1.5">
              {group.rows.map((row, ri) => (
                <div key={ri} className="flex items-center gap-2">
                  <TextInput
                    value={row.label}
                    onChange={(e) => setRow(gi, ri, { label: e.target.value })}
                    placeholder="Above ₹999"
                  />
                  <TextInput
                    value={row.discount}
                    onChange={(e) => setRow(gi, ri, { discount: e.target.value })}
                    placeholder="22% OFF"
                    className="w-[110px] shrink-0"
                  />
                  <button
                    onClick={() => setGroup(gi, { rows: group.rows.filter((_, i) => i !== ri) })}
                    aria-label="Remove offer"
                    className="cursor-pointer rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setGroup(gi, { rows: [...group.rows, { label: "", discount: "" }] })}
              className="mt-2 flex cursor-pointer items-center gap-1 text-[12px] font-semibold text-[var(--c-deep)] hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add offer
            </button>
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        className="mt-3 py-2 text-[13px]"
        onClick={() => patch({ groups: [...promo.groups, { heading: "", rows: [{ label: "", discount: "" }] }] })}
      >
        <Plus className="h-4 w-4" /> Add section
      </Button>

      <Field label="Small print" className="mt-4">
        <TextInput value={promo.footnote} onChange={(e) => patch({ footnote: e.target.value })} placeholder="*T&C apply." />
      </Field>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => setPreview(true)}>
          Preview
        </Button>
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save pop-up"}
        </Button>
      </div>

      {preview && <PromoCard promo={normalisePromo(promo)} shopName={shopName} onClose={() => setPreview(false)} />}
    </Card>
  );
};

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

/* ------------------------------------------------------------------------
   Login passcodes — reset the built-in admin and shared staff passcodes.
   (Passcodes of individual user accounts are reset under Users & Access.)
   ------------------------------------------------------------------------ */

const PASSCODE_ROLES = [
  { role: "admin", title: "Admin passcode", hint: "Opens both dashboards with full admin rights." },
  { role: "staff", title: "Staff passcode", hint: "The shared staff login (not individual user accounts)." },
] as const;

export const LoginPasscodesCard = ({ onChanged }: { onChanged: (message?: string) => void }) => {
  const [status, setStatus] = useState<{ admin: boolean; staff: boolean } | null>(null);
  const [drafts, setDrafts] = useState({ admin: { next: "", confirm: "" }, staff: { next: "", confirm: "" } });
  const [saving, setSaving] = useState<"admin" | "staff" | null>(null);
  const [error, setError] = useState<{ role: "admin" | "staff"; text: string } | null>(null);

  const load = React.useCallback(() => {
    getLoginPasscodeStatus()
      .then((res) => res.ok && setStatus(res.data))
      .catch(() => setStatus(null));
  }, []);
  React.useEffect(load, [load]);

  const reset = async (role: "admin" | "staff", passcode: string | null) => {
    setError(null);
    if (passcode !== null) {
      const { next, confirm } = drafts[role];
      if (next.trim().length < 4) return setError({ role, text: "Use at least 4 characters." });
      if (next !== confirm) return setError({ role, text: "The two passcodes don't match." });
    }
    setSaving(role);
    const res = await act(resetLoginPasscode({ role, passcode }));
    setSaving(null);
    if (!res.ok) return;
    setDrafts({ ...drafts, [role]: { next: "", confirm: "" } });
    load();
    const label = role === "admin" ? "Admin" : "Staff";
    onChanged(passcode === null ? `${label} passcode set back to the server value.` : `${label} passcode changed.`);
  };

  return (
    <Card className="mt-4 p-5">
      <h3 className="mb-1 text-[15px] font-bold text-gray-900">Login Passcodes</h3>
      <p className="mb-4 text-[12px] text-gray-500">
        Reset the passcodes used on the login page. The old passcode stops working as soon as you save. To reset a
        passcode for one person&rsquo;s own account, edit them under Users &amp; Access below.
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {PASSCODE_ROLES.map(({ role, title, hint }) => (
          <div key={role} className="rounded-lg border border-[#e5e7eb] p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[13.5px] font-bold text-gray-900">{title}</p>
              {status && (
                <Pill tone={status[role] ? "green" : "gray"}>{status[role] ? "Changed in Settings" : "Server default"}</Pill>
              )}
            </div>
            <p className="mb-3 text-[11.5px] text-gray-500">{hint}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <TextInput
                type="password"
                autoComplete="new-password"
                value={drafts[role].next}
                onChange={(e) => setDrafts({ ...drafts, [role]: { ...drafts[role], next: e.target.value } })}
                placeholder="New passcode"
              />
              <TextInput
                type="password"
                autoComplete="new-password"
                value={drafts[role].confirm}
                onChange={(e) => setDrafts({ ...drafts, [role]: { ...drafts[role], confirm: e.target.value } })}
                placeholder="Repeat new passcode"
              />
            </div>
            {error?.role === role && <p className="mt-2 text-[12px] font-semibold text-red-600">{error.text}</p>}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {status?.[role] && (
                <Button
                  variant="ghost"
                  className="py-2 text-[12.5px]"
                  disabled={saving !== null}
                  onClick={() => reset(role, null)}
                >
                  Use server default
                </Button>
              )}
              <Button
                className="py-2 text-[12.5px]"
                disabled={saving !== null || !drafts[role].next}
                onClick={() => reset(role, drafts[role].next)}
              >
                <Save className="h-4 w-4" /> {saving === role ? "Saving…" : "Reset passcode"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

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
                  No user accounts yet. The admin passcode (see Login Passcodes above) always works.
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
