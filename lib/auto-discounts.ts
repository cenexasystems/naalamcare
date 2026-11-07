/* ==========================================================================
   Automatic category-wise discounts by bill slab
   (Settings → Billing · Automatic Discounts, separately for each dashboard)

   1. Add up the bill's lines BEFORE this discount (selling price × qty; on
      wholesale, after the pharmacy's own discount and quantity tiers). That
      subtotal picks exactly one slab. The slab never changes because of the
      discount itself.
   2. Every line is discounted on its own, at the % its product category has
      in that slab:   line discount = line amount × % / 100
   3. Total automatic discount = sum of the line discounts.

   A product's category is its Product Type (Inventory → edit medicine). A
   product with no type, or with a type that is switched off for discounts,
   falls back to the default category (General).

   Slab ranges are inclusive on both ends, in rupees and paise:
     ₹0 – ₹699.99 · ₹700 – ₹999.99 · ₹1000 and above (no upper limit).
   A switched-off slab still owns its range — bills in it get no automatic
   discount — so every amount always maps to exactly one slab.

   Shared by the billing screens (live preview) and the server (the amount
   actually charged), so the two can never disagree.
   ========================================================================== */

export type DiscountCategory = { name: string; active: boolean };

export type DiscountSlab = {
  id: string;
  name: string;
  /** Lowest bill subtotal in this slab (included) */
  min: number;
  /** Highest bill subtotal in this slab (included); null = no upper limit */
  max: number | null;
  enabled: boolean;
  /** % off for each category name in this slab (missing = 0%) */
  rates: Record<string, number>;
};

export type AutoDiscountConfig = {
  enabled: boolean;
  /** Can the counter's manual discount be added on top of an automatic one? */
  allow_manual: boolean;
  /** Category used for products without one (or with a switched-off one) */
  default_category: string;
  categories: DiscountCategory[];
  slabs: DiscountSlab[];
};

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const n = (v: unknown) => {
  const x = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** The starting configuration (Tablet / Injection / General, three slabs). */
export const defaultAutoDiscounts = (categoryNames: string[], enabled: boolean): AutoDiscountConfig => {
  const names = [...new Set(["Tablet", "Injection", "General", "Liquid", ...categoryNames])];
  // Liquid starts at the Tablet rates, Cartridge at the Injection rates, others at the General rate. Edit them in Settings.
  const rate = (name: string, tablet: number, injection: number, general: number) =>
    name === "Tablet" || name === "Liquid" ? tablet : name === "Injection" || name === "Cartridge" ? injection : general;
  const rates = (t: number, i: number, g: number) => Object.fromEntries(names.map((nm) => [nm, rate(nm, t, i, g)]));
  return {
    enabled,
    allow_manual: true,
    default_category: "General",
    categories: names.map((name) => ({ name, active: true })),
    slabs: [
      { id: "slab-1", name: "Slab 1", min: 1000, max: null, enabled: true, rates: rates(22, 20, 5) },
      { id: "slab-2", name: "Slab 2", min: 700, max: 999.99, enabled: true, rates: rates(16, 14, 5) },
      { id: "slab-3", name: "Slab 3", min: 0, max: 699.99, enabled: true, rates: rates(10, 10, 5) },
    ],
  };
};

/** Clean stored / submitted config. Bad data → switched off with no slabs (never a surprise discount). */
export const normaliseAutoDiscounts = (raw: unknown): AutoDiscountConfig => {
  let data: Partial<AutoDiscountConfig> = {};
  try {
    data = typeof raw === "string" ? (raw ? JSON.parse(raw) : {}) : ((raw as Partial<AutoDiscountConfig>) ?? {});
  } catch {
    data = {};
  }
  const seen = new Set<string>();
  const categories = (Array.isArray(data.categories) ? data.categories : [])
    .map((c) => ({ name: typeof c?.name === "string" ? c.name.trim().slice(0, 40) : "", active: c?.active !== false }))
    .filter((c) => c.name && !seen.has(c.name.toLowerCase()) && seen.add(c.name.toLowerCase()));
  const slabs = (Array.isArray(data.slabs) ? data.slabs : []).slice(0, 20).map((s, i) => {
    const rates: Record<string, number> = {};
    for (const c of categories) rates[c.name] = Math.min(100, Math.max(0, r2(n(s?.rates?.[c.name]))));
    const max = s?.max === null || s?.max === undefined || (s?.max as unknown) === "" ? null : r2(n(s.max));
    return {
      id: typeof s?.id === "string" && s.id ? s.id.slice(0, 40) : `slab-${i + 1}`,
      name: typeof s?.name === "string" && s.name.trim() ? s.name.trim().slice(0, 40) : `Slab ${i + 1}`,
      min: r2(n(s?.min)),
      max,
      enabled: s?.enabled !== false,
      rates,
    };
  });
  const fallback = categories.find((c) => c.name === data.default_category)?.name ?? categories[0]?.name ?? "General";
  return {
    enabled: Boolean(data.enabled) && slabs.length > 0,
    allow_manual: data.allow_manual !== false,
    default_category: fallback,
    categories,
    slabs: slabs.sort((a, b) => a.min - b.min),
  };
};

/** Every problem with a config, in plain words ([] = valid). Raw input is checked so typos aren't silently fixed. */
export const validateAutoDiscounts = (raw: AutoDiscountConfig): string[] => {
  const errors: string[] = [];
  const cats = raw.categories ?? [];
  const names = cats.map((c) => (c.name || "").trim());
  if (names.some((x) => !x)) errors.push("Every category needs a name.");
  const lower = names.map((x) => x.toLowerCase());
  if (new Set(lower).size !== lower.length) errors.push("Two categories have the same name.");
  if (!names.includes(raw.default_category)) errors.push("Choose a default category from the list.");
  else if (!cats.find((c) => c.name === raw.default_category)?.active) errors.push("The default category must be switched on.");
  const slabs = [...(raw.slabs ?? [])];
  if (!slabs.length) errors.push("Add at least one slab.");
  for (const s of slabs) {
    const label = s.name || "A slab";
    if (!Number.isFinite(s.min) || s.min < 0) errors.push(`${label}: the minimum bill amount must be ₹0 or more.`);
    if (s.max !== null && (!Number.isFinite(s.max) || s.max < s.min))
      errors.push(`${label}: the maximum must be at least the minimum (or left blank for no limit).`);
    for (const [cat, pct] of Object.entries(s.rates ?? {}))
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) errors.push(`${label}: ${cat} must be between 0% and 100%.`);
  }
  if (errors.length) return errors;
  // Ranges: start at ₹0, no overlaps, no gaps (a paisa apart is joined), last one open-ended.
  slabs.sort((a, b) => a.min - b.min);
  if (slabs[0].min !== 0) errors.push(`The lowest slab must start at ₹0 (it starts at ₹${slabs[0].min}).`);
  for (let i = 1; i < slabs.length; i += 1) {
    const prev = slabs[i - 1];
    const cur = slabs[i];
    if (prev.max === null) {
      errors.push(`${prev.name} has no upper limit, so ${cur.name} can never apply.`);
      break;
    }
    if (cur.min <= prev.max) errors.push(`${prev.name} (up to ₹${prev.max}) overlaps ${cur.name} (from ₹${cur.min}).`);
    else if (r2(cur.min - prev.max) > 0.01)
      errors.push(`Bills between ₹${prev.max} and ₹${cur.min} fall in no slab — close the gap.`);
  }
  if (slabs[slabs.length - 1].max !== null) errors.push("The highest slab must have no upper limit (leave its maximum blank).");
  return errors;
};

/**
 * Categories are the shop's Product Types (shared by both dashboards); each dashboard keeps its own
 * on/off switch and slab %s for them. Lines the config up with the current list: a newly added type
 * appears switched on at 0% until the admin sets its %s; a deleted type drops out.
 */
export const syncCategories = (config: AutoDiscountConfig, productTypes: string[]): AutoDiscountConfig => {
  if (!productTypes.length) return config;
  const seen = new Set<string>();
  const names = [...productTypes, config.default_category].filter(
    (x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()),
  );
  const find = <T extends { name: string }>(list: T[], name: string) => list.find((c) => c.name.toLowerCase() === name.toLowerCase());
  const categories = names.map((name) => ({ name, active: find(config.categories, name)?.active ?? true }));
  const slabs = config.slabs.map((s) => {
    const byLower = new Map(Object.entries(s.rates).map(([k, v]) => [k.toLowerCase(), v]));
    return { ...s, rates: Object.fromEntries(names.map((name) => [name, byLower.get(name.toLowerCase()) ?? 0])) };
  });
  const def = names.find((x) => x.toLowerCase() === config.default_category.toLowerCase()) ?? config.default_category;
  return { ...config, default_category: def, categories, slabs };
};

/** The discount category a product bills under. */
export const categoryFor = (config: AutoDiscountConfig, productType?: string): string => {
  const key = (productType || "").trim().toLowerCase();
  const own = config.categories.find((c) => c.active && c.name.toLowerCase() === key);
  return own ? own.name : config.default_category;
};

/** The slab a pre-discount subtotal falls in (null only for an empty or invalid config). */
export const slabFor = (config: AutoDiscountConfig, subtotal: number): DiscountSlab | null =>
  config.slabs.find((s) => subtotal >= s.min && (s.max === null || subtotal <= s.max)) ?? null;

export type AutoLine = { category: string; percent: number; discount: number; net: number };
export type AutoResult = {
  /** Bill subtotal before the automatic discount — the amount that chose the slab */
  subtotal: number;
  slab: DiscountSlab | null;
  /** Why no discount applies, when none does */
  inactive: "" | "disabled" | "slab-off" | "empty";
  lines: AutoLine[];
  byCategory: { category: string; percent: number; base: number; discount: number }[];
  total: number;
};

/**
 * Discount every line of a bill. `amount` is the line's billed amount (price × qty) before this discount.
 * `no_discount` lines (already discounted by an offer that doesn't stack) still count towards the slab.
 */
export const calcAutoDiscounts = (
  config: AutoDiscountConfig,
  lines: { product_type?: string; amount: number; no_discount?: boolean }[],
): AutoResult => {
  const subtotal = r2(lines.reduce((s, l) => s + n(l.amount), 0));
  const slab = config.enabled ? slabFor(config, subtotal) : null;
  const inactive = !config.enabled ? "disabled" : !lines.length || subtotal <= 0 ? "empty" : slab && !slab.enabled ? "slab-off" : "";
  const out: AutoLine[] = lines.map((l) => {
    const category = categoryFor(config, l.product_type);
    const amount = n(l.amount);
    const percent = slab && slab.enabled && !inactive && !l.no_discount ? n(slab.rates[category]) : 0;
    const discount = r2((amount * percent) / 100);
    return { category, percent, discount, net: r2(amount - discount) };
  });
  const groups = new Map<string, { category: string; percent: number; base: number; discount: number }>();
  out.forEach((l, i) => {
    if (l.discount <= 0) return;
    const g = groups.get(l.category) ?? { category: l.category, percent: l.percent, base: 0, discount: 0 };
    g.base = r2(g.base + n(lines[i].amount));
    g.discount = r2(g.discount + l.discount);
    groups.set(l.category, g);
  });
  return {
    subtotal,
    slab,
    inactive,
    lines: out,
    byCategory: [...groups.values()],
    total: r2(out.reduce((s, l) => s + l.discount, 0)),
  };
};

/** "₹700 – ₹999.99" / "₹1000 and above" */
export const slabRange = (s: Pick<DiscountSlab, "min" | "max">): string =>
  s.max === null ? `₹${s.min} and above` : `₹${s.min} – ₹${s.max}`;

/**
 * What each line of a saved bill actually cost: its automatic discount comes off the line itself,
 * then any bill-wide discount (offer, counter discount) is shared across lines so they add up to
 * the bill total. Used by the invoice, returns and reports.
 */
export const billLineNets = (bill: {
  grand_total: number;
  items: { line_amount: number; auto_discount?: number; promo_discount?: number }[];
}): number[] => {
  const afterAuto = bill.items.map((i) => n(i.line_amount) - n(i.promo_discount) - n(i.auto_discount));
  const sum = afterAuto.reduce((s, x) => s + x, 0);
  const factor = sum > 0 ? n(bill.grand_total) / sum : 1;
  return afterAuto.map((x) => x * factor);
};

/** What one unit of each line actually cost the customer (see billLineNets). */
export const unitPaidOf = <I extends { id: string; qty: number; line_amount: number; auto_discount?: number; promo_discount?: number }>(bill: {
  grand_total: number;
  items: I[];
}): ((item: I) => number) => {
  const nets = billLineNets(bill);
  const byId = new Map(bill.items.map((it, k) => [it.id, it.qty > 0 ? nets[k] / it.qty : 0]));
  return (item) => byId.get(item.id) ?? 0;
};
