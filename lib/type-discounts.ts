/* ==========================================================================
   Automatic discounts by product type, applied at billing (Settings →
   Product-type Discounts, per dashboard). Items whose type has no rule of
   its own get no type discount.

   For each product type with rules, the bill's lines of that type are added
   up; that total falls into exactly one band, and the band's % comes off
   those lines. A band covers `from` (included) up to `to` (not included);
   `to` = 0 means no upper limit. Example — Tablets:
     ₹0   – ₹999   → 10%
     ₹999 – ₹6999  → 22%
     ₹6999 and up  → 16%
   ========================================================================== */

export type DiscountBand = { from: number; to: number; percent: number };
export type TypeDiscountRule = { type: string; bands: DiscountBand[] };

export const DEFAULT_TYPE_DISCOUNTS: TypeDiscountRule[] = [
  {
    type: "Tablet",
    bands: [
      { from: 0, to: 999, percent: 10 },
      { from: 999, to: 6999, percent: 22 },
      { from: 6999, to: 0, percent: 16 },
    ],
  },
  {
    type: "Injection",
    bands: [
      { from: 0, to: 699, percent: 10 },
      { from: 699, to: 999, percent: 14 },
      { from: 999, to: 0, percent: 20 },
    ],
  },
  { type: "General", bands: [{ from: 0, to: 0, percent: 5 }] },
];

const n = (v: unknown) => {
  const x = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
};
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/** Clean stored / submitted rules: one entry per type, bands sorted, nonsense dropped. */
export const normaliseTypeDiscounts = (raw: unknown): TypeDiscountRule[] => {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = raw ? JSON.parse(raw) : [];
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: TypeDiscountRule[] = [];
  for (const item of list) {
    const type = typeof item?.type === "string" ? item.type.trim().slice(0, 40) : "";
    if (!type || seen.has(type.toLowerCase())) continue;
    const bands = (Array.isArray(item.bands) ? item.bands : [])
      .slice(0, 12)
      .map((b: unknown) => {
        const band = b as Partial<DiscountBand>;
        return { from: Math.max(0, r2(n(band?.from))), to: Math.max(0, r2(n(band?.to))), percent: Math.min(100, Math.max(0, r2(n(band?.percent)))) };
      })
      .filter((b: DiscountBand) => b.percent > 0 && (b.to === 0 || b.to > b.from))
      .sort((a: DiscountBand, b: DiscountBand) => a.from - b.from);
    if (!bands.length) continue;
    seen.add(type.toLowerCase());
    out.push({ type, bands });
  }
  return out;
};

export type TypeDiscountPart = { type: string; subtotal: number; percent: number; discount: number };

/** Which rule a product type is billed under (lower-case), or "" when it has no rule — those items get no type discount. */
const ruleKeyFor = (rules: TypeDiscountRule[], productType?: string): string => {
  const key = (productType || "").trim().toLowerCase();
  return key && rules.some((r) => r.type.toLowerCase() === key) ? key : "";
};

/** Discount for each product type on the bill, and the total. Lines carry their amount after per-line discounts. */
export const calcTypeDiscounts = (
  rules: TypeDiscountRule[],
  lines: { product_type?: string; amount: number }[],
): { total: number; parts: TypeDiscountPart[] } => {
  const parts: TypeDiscountPart[] = [];
  for (const rule of rules) {
    const key = rule.type.toLowerCase();
    const subtotal = r2(lines.filter((l) => ruleKeyFor(rules, l.product_type) === key).reduce((s, l) => s + n(l.amount), 0));
    if (subtotal <= 0) continue;
    const band = rule.bands.find((b) => subtotal >= b.from && (b.to === 0 || subtotal < b.to));
    if (!band) continue;
    parts.push({ type: rule.type, subtotal, percent: band.percent, discount: r2((subtotal * band.percent) / 100) });
  }
  return { total: r2(parts.reduce((s, p) => s + p.discount, 0)), parts };
};

/** The product-type discount % each line got on this bill (by line index), worked out the same way as at billing. */
export const lineTypePercents = (
  rules: TypeDiscountRule[],
  lines: { product_type?: string; amount: number }[],
): number[] => {
  const byType = new Map(calcTypeDiscounts(rules, lines).parts.map((p) => [p.type.toLowerCase(), p.percent]));
  return lines.map((l) => byType.get(ruleKeyFor(rules, l.product_type)) ?? 0);
};
