/** Product types offered for medicines; the shop edits the list in Settings → Product Types. */
export const DEFAULT_PRODUCT_TYPES = ["Tablet", "Injection", "General", "Cartridge", "Bottle", "Box"];

/** Stored JSON list → clean, de-duplicated names ("" or bad data → the defaults). */
export const parseProductTypes = (raw: unknown): string[] => {
  let list: unknown = raw;
  if (typeof raw === "string") {
    if (!raw) return DEFAULT_PRODUCT_TYPES;
    try {
      list = JSON.parse(raw);
    } catch {
      return DEFAULT_PRODUCT_TYPES;
    }
  }
  if (!Array.isArray(list)) return DEFAULT_PRODUCT_TYPES;
  const seen = new Set<string>();
  return list
    .map((t) => (typeof t === "string" ? t.trim().slice(0, 40) : ""))
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
};

/** Options for a product-type picker: the shop's list, plus the current value if it was since removed. */
export const productTypeOptions = (types: string[], current: string): string[] =>
  current && !types.includes(current) ? [...types, current] : types;
