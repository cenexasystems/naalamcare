/* Shop-wide pick lists edited in Settings and shared by retail and wholesale. */

/** Product types offered for medicines (Settings → Product Types). */
export const DEFAULT_PRODUCT_TYPES = ["Tablet", "Injection", "General", "Cartridge", "Bottle", "Box"];

/** Purchase units a batch can be bought in (Settings → Purchase Units). */
export const DEFAULT_PURCHASE_UNITS = ["Strip", "Piece", "Bottle", "Cartridge"];

/** Stored JSON list → clean, de-duplicated names ("" or bad data → `defaults`). */
export const parseNameList = (raw: unknown, defaults: string[]): string[] => {
  let list: unknown = raw;
  if (typeof raw === "string") {
    if (!raw) return defaults;
    try {
      list = JSON.parse(raw);
    } catch {
      return defaults;
    }
  }
  if (!Array.isArray(list)) return defaults;
  const seen = new Set<string>();
  return list
    .map((t) => (typeof t === "string" ? t.trim().slice(0, 40) : ""))
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
};

export const parseProductTypes = (raw: unknown): string[] => parseNameList(raw, DEFAULT_PRODUCT_TYPES);
export const parsePurchaseUnits = (raw: unknown): string[] => parseNameList(raw, DEFAULT_PURCHASE_UNITS);

/** Options for a picker: the shop's list, plus the current value if it was since removed. */
export const productTypeOptions = (types: string[], current: string): string[] =>
  current && !types.includes(current) ? [...types, current] : types;
