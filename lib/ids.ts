import type { Mode } from "./mode";

/** Customer IDs: NCM000001 for retail customers, NCW000001 for wholesale buyers.
    Older AKP… IDs are kept as they are on existing records. */
export const formatCustomerId = (num: number, mode: Mode = "retail") =>
  `${mode === "wholesale" ? "NCW" : "NCM"}${num.toString().padStart(6, "0")}`;

/** New bill numbers are a plain running number ("1", "2", "3", …) so the
   receipt reads as the shop wanted it — no INV- prefix, no random suffix.
   Each dashboard has its own counter and an optional prefix (Settings), so
   retail and wholesale invoice numbers never collide. */
export const formatBillId = (num: number, prefix = "") => `${prefix}${num}`;

export const formatPoNumber = (num: number, mode: Mode) =>
  `${mode === "wholesale" ? "WPO" : "PO"}-${num.toString().padStart(5, "0")}`;
