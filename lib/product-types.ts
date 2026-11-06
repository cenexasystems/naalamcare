/* Shop-wide pick lists edited in Settings and shared by retail and wholesale. */

/** Product types offered for medicines (Settings → Product Types). */
export const DEFAULT_PRODUCT_TYPES = ["Tablet", "Injection", "General", "Liquid", "Cartridge", "Bottle", "Box"];

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

/** Product types always bought and sold as single pieces (the General item behaviour). */
const PIECE_PRODUCT_TYPES = ["general", "liquid", "bottle", "cartridge"];
export const isPieceProductType = (productType?: string): boolean =>
  PIECE_PRODUCT_TYPES.includes((productType || "").trim().toLowerCase());

/**
 * Single-item products: one piece per pack, no boxes, so quantity = stock. Returns the pack type to
 * store, or null when the product keeps pack sizes (Tablets and everything else). Applies to new
 * stock only — existing batches keep the pack size their prices and quantities were saved with.
 */
export const singleItemUnit = (productType?: string, unitType?: string): string | null => {
  if (isPieceProductType(productType)) return "Piece";
  return unitType === "Bottle" || unitType === "Cartridge" ? unitType : null;
};

/** Options for a picker: the shop's list, plus the current value if it was since removed. */
export const productTypeOptions = (types: string[], current: string): string[] =>
  current && !types.includes(current) ? [...types, current] : types;
