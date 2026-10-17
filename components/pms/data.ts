"use client";

import useSWR, { mutate } from "swr";
import type {
  MedicineWithBatches,
  Customer,
  Supplier,
  Bill,
  ScopedSettings,
  BatchRow,
  LedgerData,
  ReconciliationSummary,
} from "@/lib/types";
import type { Mode } from "@/lib/mode";
import { useMode } from "./mode-context";

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error || `Request failed (${res.status})`), { status: res.status });
  }
  return res.json();
};

/** Every list is fetched for one dashboard; the key carries the mode so caches never mix. */
const keyFor = (path: string, mode: Mode | null) => (mode ? `${path}?mode=${mode}` : null);

export const useMedicines = () => useSWR<MedicineWithBatches[]>(keyFor("/api/medicines", useMode()), fetcher);
export const useBatchRows = () => useSWR<BatchRow[]>(keyFor("/api/batches", useMode()), fetcher);
export const useCustomers = () => useSWR<Customer[]>(keyFor("/api/customers", useMode()), fetcher);
export const useSuppliers = () => useSWR<Supplier[]>(keyFor("/api/suppliers", useMode()), fetcher);
export const useBills = () => useSWR<Bill[]>(keyFor("/api/bills", useMode()), fetcher);
export const useSettings = () => useSWR<ScopedSettings>(keyFor("/api/settings", useMode()), fetcher);
export const useLedger = () => useSWR<LedgerData>(keyFor("/api/ledger", useMode()), fetcher);
/** Admin only — pass false to skip the request for staff. */
export const useReconciliation = (enabled: boolean) => {
  const mode = useMode();
  return useSWR<ReconciliationSummary>(enabled ? keyFor("/api/reconciliation", mode) : null, fetcher);
};

/** Refetch every list (both dashboards' cached keys). */
export const mutateAll = () => mutate((key) => typeof key === "string" && key.startsWith("/api/"));
