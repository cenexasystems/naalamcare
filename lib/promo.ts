/* ==========================================================================
   Offer pop-up shown to customers who open their invoice from the link we
   send them (WhatsApp). Edited per dashboard in Settings → Invoice Offer Pop-up.
   Shared by the server (load / save) and the browser (pop-up, settings form).
   ========================================================================== */

export type PromoRow = { label: string; discount: string };
export type PromoGroup = { heading: string; rows: PromoRow[] };

export type InvoicePromo = {
  enabled: boolean;
  title: string;
  subtitle: string;
  groups: PromoGroup[];
  footnote: string;
  /** Card background, e.g. "#e31e24"; "" = the app's theme colour */
  color: string;
};

export const DEFAULT_PROMO: InvoicePromo = {
  enabled: false,
  title: "OFFERS",
  subtitle: "Save more on your next medicine bill",
  groups: [
    {
      heading: "Tablets",
      rows: [
        { label: "Above ₹999", discount: "22% OFF" },
        { label: "Above ₹6999", discount: "16% OFF" },
        { label: "Below ₹6999", discount: "10% OFF" },
      ],
    },
    {
      heading: "Injections",
      rows: [
        { label: "Above ₹999", discount: "20% OFF" },
        { label: "Above ₹699", discount: "14% OFF" },
        { label: "Below ₹699", discount: "10% OFF" },
      ],
    },
    { heading: "General", rows: [{ label: "All other items", discount: "5% OFF" }] },
  ],
  footnote: "*T&C apply.",
  color: "",
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Clean whatever was stored or submitted into a safe pop-up (bad / blank input → defaults). */
export const normalisePromo = (raw: unknown): InvoicePromo => {
  let data: Partial<InvoicePromo> = {};
  try {
    data = typeof raw === "string" ? (raw ? JSON.parse(raw) : {}) : ((raw as Partial<InvoicePromo>) ?? {});
  } catch {
    data = {};
  }
  if (!data || typeof data !== "object" || !Object.keys(data).length) return DEFAULT_PROMO;
  const groups = (Array.isArray(data.groups) ? data.groups : [])
    .slice(0, 10)
    .map((g) => ({
      heading: text(g?.heading, 40),
      rows: (Array.isArray(g?.rows) ? g.rows : [])
        .slice(0, 12)
        .map((r) => ({ label: text(r?.label, 60), discount: text(r?.discount, 30) }))
        .filter((r) => r.label || r.discount),
    }))
    .filter((g) => g.heading || g.rows.length);
  return {
    enabled: Boolean(data.enabled),
    title: text(data.title, 40),
    subtitle: text(data.subtitle, 120),
    groups,
    footnote: text(data.footnote, 160),
    color: /^#[0-9a-f]{6}$/i.test(String(data.color)) ? String(data.color) : "",
  };
};
