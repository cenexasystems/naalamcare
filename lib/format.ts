/* ==========================================================================
   Theme presets

   The POS shell used to hard-code the brand teal in ~90 Tailwind class
   names, which made the settings colour picker a no-op. Colour now lives in
   four CSS custom properties that `applyTheme()` writes onto <html>, and the
   class names reference those properties, so changing the theme in Settings
   restyles the whole app.
   ========================================================================== */

export type ThemeKey = "nalam" | "teal" | "green" | "blue" | "maroon" | "purple";

export type ThemeTokens = {
  /** Primary action colour — buttons, active nav, focus rings. */
  primary: string;
  /** Darker shade for headings and pressed states. */
  deep: string;
  /** Hover shade. */
  hover: string;
  /** Very light tint for chips and selected backgrounds. */
  mint: string;
};

export const THEMES: Record<ThemeKey, { label: string; tokens: ThemeTokens }> = {
  /* Royal blue sampled from the Nalam Care Medicals logo. */
  nalam: {
    label: "Nalam Blue",
    tokens: { primary: "#1d3faf", deep: "#021c8b", hover: "#0f2c9c", mint: "#e8ecfa" },
  },
  teal: {
    label: "Teal",
    tokens: { primary: "#007f72", deep: "#00695e", hover: "#00736a", mint: "#e5f4f1" },
  },
  green: {
    label: "Green",
    tokens: { primary: "#16a34a", deep: "#15803d", hover: "#15803d", mint: "#e7f6ec" },
  },
  blue: {
    label: "Blue",
    tokens: { primary: "#1f6feb", deep: "#1a4fb4", hover: "#1a5fd0", mint: "#eaf1fe" },
  },
  maroon: {
    label: "Maroon",
    tokens: { primary: "#9f1239", deep: "#7f1029", hover: "#881337", mint: "#fdeaef" },
  },
  purple: {
    label: "Purple",
    tokens: { primary: "#7c3aed", deep: "#6021c9", hover: "#6d28d9", mint: "#f0eafe" },
  },
};

export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];

export const DEFAULT_THEME: ThemeKey = "nalam";

/** Map whatever is stored in settings onto a known theme key. */
export const resolveTheme = (value?: string | null): ThemeKey =>
  (THEME_KEYS as string[]).includes((value || "").toLowerCase())
    ? (value!.toLowerCase() as ThemeKey)
    : DEFAULT_THEME;

export const themeTokens = (value?: string | null): ThemeTokens => THEMES[resolveTheme(value)].tokens;

/* ==========================================================================
   Display formatting helpers
   ========================================================================== */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const money = (n: number | string): string =>
  `₹ ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const amount = (n: number | string): string =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const qtyLabel = (n: number | string): string =>
  Number(n || 0).toLocaleString("en-IN");

/** "1453.00" -> "ONE THOUSAND FOUR HUNDRED FIFTY THREE ONLY" (English words,
    upper case, the style printed under "Net Amount" on a GST tax invoice). */
const WORD_ONES = [
  "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
  "SEVENTEEN", "EIGHTEEN", "NINETEEN",
];
const WORD_TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

const twoDigitWords = (n: number): string =>
  n < 20 ? WORD_ONES[n] : `${WORD_TENS[Math.floor(n / 10)]}${n % 10 ? ` ${WORD_ONES[n % 10]}` : ""}`;

const threeDigitWords = (n: number): string => {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${WORD_ONES[h]} HUNDRED` : "", rest ? twoDigitWords(rest) : ""]
    .filter(Boolean)
    .join(" ");
};

export const amountInWords = (value: number | string): string => {
  const num = Math.floor(Math.abs(Number(value || 0)));
  if (!num) return "ZERO";
  const groups: string[] = [];
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const rest = num % 1000;
  if (crore) groups.push(`${threeDigitWords(crore)} CRORE`);
  if (lakh) groups.push(`${twoDigitWords(lakh)} LAKH`);
  if (thousand) groups.push(`${threeDigitWords(thousand)} THOUSAND`);
  if (rest) groups.push(threeDigitWords(rest));
  return `${groups.join(" ")} ONLY`;
};

/** "2025-05" -> "May-25"  (the format the client used on slides 9, 11 and 17) */
export const monthShort = (value: string): string => {
  if (!value) return "-";
  const [y, m] = value.split("-");
  const idx = Number(m) - 1;
  if (!y || idx < 0 || idx > 11) return value;
  return `${MONTHS[idx]}-${y.slice(2)}`;
};

/** "2025-05" -> "05/2025"  (the format used in the inventory table, slide 16) */
export const monthSlash = (value: string): string => {
  if (!value) return "-";
  const [y, m] = value.split("-");
  if (!y || !m) return value;
  return `${m.padStart(2, "0")}/${y}`;
};

/** Every date/time label on the receipt has to read in the pharmacy's own
   local time — the app is served from Vercel (UTC) but the shop is in India,
   so "6:26 pm IST" was rendering as "12:56 pm UTC" on the invoice. */
const TZ = "Asia/Kolkata";

/** "2026-08-30" -> "30 Aug 2026". Parses "YYYY-MM-DD" as calendar date so a
   plain `date` column never shifts a day when the server sits in UTC. */
export const dateLong = (value: string): string => {
  if (!value) return "-";
  const head = value.slice(0, 10);
  const parts = head.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number);
    if (y && m >= 1 && m <= 12 && d) {
      return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
    }
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  const parts2 = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).formatToParts(dt);
  const get = (t: string) => parts2.find((p) => p.type === t)?.value || "";
  return `${get("day")} ${get("month")} ${get("year")}`;
};

/** "2026-08-30" -> "30/08/2026" */
export const dateSlash = (value: string): string => {
  if (!value) return "-";
  const head = value.slice(0, 10);
  const parts = head.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number);
    if (y && m && d) {
      return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
    }
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(dt);
};

export const timeLabel = (value: string): string => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: TZ,
  });
};

export const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const thisMonthIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export type ExpiryState = "EXPIRED" | "SOON" | "OK";

/** Expiry bucket for a "yyyy-mm" batch expiry, relative to today. */
export const expiryState = (expDate: string, alertMonths = 6): ExpiryState => {
  if (!expDate) return "OK";
  const [y, m] = expDate.split("-").map(Number);
  if (!y || !m) return "OK";
  // A batch is usable up to the last day of its expiry month
  const expEnd = new Date(y, m, 0, 23, 59, 59);
  const now = new Date();
  if (expEnd < now) return "EXPIRED";
  const limit = new Date(now.getFullYear(), now.getMonth() + alertMonths, now.getDate());
  return expEnd <= limit ? "SOON" : "OK";
};

export const monthsToExpiry = (expDate: string): number => {
  if (!expDate) return 0;
  const [y, m] = expDate.split("-").map(Number);
  if (!y || !m) return 0;
  const now = new Date();
  return (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
};

/** Schedule label shown in the inventory grid — "SCHEDULED - H" / "OTC" */
export const scheduleLabel = (schedule: string): string =>
  schedule === "OTC" ? "OTC" : `SCHEDULED - ${schedule}`;

export const scheduleIsOtc = (schedule: string): boolean => schedule === "OTC";

/** Only strips are split into single units (tablets). Bottles, pieces, tubes… are always sold whole. */
export const splitsIntoUnits = (unitType: string): boolean => unitType === "Strip";

/** Sellable unit noun for a purchase unit type */
export const unitNoun = (unitType: string, packSize: number): string => {
  if (unitType === "Strip") return packSize > 1 ? "Tablets" : "Tablet";
  if (unitType === "Bottle") return "Bottles";
  if (unitType === "Piece" || !unitType) return "Pieces";
  // Units added in Settings: a pack of one is the unit itself ("Tubes"), otherwise loose units.
  return packSize > 1 ? "Units" : packNoun(unitType);
};

export const packNoun = (unitType: string): string => {
  if (unitType === "Strip") return "Strips";
  if (unitType === "Bottle") return "Bottles";
  if (unitType === "Piece" || !unitType) return "Pieces";
  return /s$/i.test(unitType) ? unitType : `${unitType}s`;
};

/** What a billing quantity counts: single units, whole packs (strips) or whole boxes. */
export type SellBy = "unit" | "pack" | "box";

type PackInfo = { purchase_unit_type: string; pack_size: number; strips_per_box: number };

/** The ways a batch can be sold, with how many units (tablets / pieces) each one is. */
export const sellByOptions = (b: PackInfo): { key: SellBy; label: string; units: number }[] => {
  const pack = b.pack_size || 1;
  const perBox = Math.max(0, b.strips_per_box || 0);
  const packs = packNoun(b.purchase_unit_type);
  const options: { key: SellBy; label: string; units: number }[] = [
    { key: "unit", label: unitNoun(b.purchase_unit_type, pack), units: 1 },
  ];
  if (pack > 1) options.push({ key: "pack", label: `${packs} (${pack} each)`, units: pack });
  if (perBox > 0) options.push({ key: "box", label: `Boxes (${perBox} ${packs.toLowerCase()})`, units: pack * perBox });
  return options;
};

/** Stock in units as boxes + strips + loose units, e.g. "2 boxes + 3 strips + 4 tablets". */
export const stockBreakdown = (b: PackInfo & { stock_qty: number }): string => {
  const pack = b.pack_size || 1;
  const perBox = Math.max(0, b.strips_per_box || 0);
  let left = Math.max(0, b.stock_qty);
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => n > 0 && parts.push(`${n} ${n === 1 ? one : many}`);
  if (perBox > 0) {
    const boxes = Math.floor(left / (pack * perBox));
    add(boxes, "box", "boxes");
    left -= boxes * pack * perBox;
  }
  if (pack > 1) {
    const packs = Math.floor(left / pack);
    const noun = packNoun(b.purchase_unit_type).toLowerCase();
    add(packs, noun.replace(/s$/, ""), noun);
    left -= packs * pack;
  }
  add(left, unitNoun(b.purchase_unit_type, 1).toLowerCase(), unitNoun(b.purchase_unit_type, 2).toLowerCase());
  return parts.join(" + ") || "0";
};
