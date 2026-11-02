"use client";

import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import type { BatchRow } from "@/lib/types";
import { playAlarmBeep } from "@/lib/alarm";

/* ------------------------------------------------------------------------
   Low-stock notification on every screen of a dashboard.
   Shows once when the dashboard opens (if anything is low or out of stock),
   then again whenever a medicine newly drops low — e.g. right after a sale.
   Settings → Notifications switches the pop-up and its sound on / off.
   ------------------------------------------------------------------------ */

type Item = { id: string; name: string; stock: number };

const seenKey = (mode: string) => `ncm_low_stock_seen_${mode}`;
const readSeen = (mode: string): string => {
  try {
    return window.sessionStorage.getItem(seenKey(mode)) ?? "";
  } catch {
    return "";
  }
};

export const LowStockNotice = ({
  mode,
  rows,
  popup,
  sound,
  onView,
}: {
  mode: string;
  /** This dashboard's stock, batch by batch — the same list and rule as the Inventory alert */
  rows: BatchRow[];
  popup: boolean;
  sound: boolean;
  onView: () => void;
}) => {
  const low: Item[] = rows
    .filter(({ batch, medicine }) => batch.stock_qty <= medicine.low_stock_threshold)
    .map(({ batch, medicine }) => ({ id: batch.id, name: `${medicine.generic_name} · ${batch.batch_no}`, stock: batch.stock_qty }))
    .sort((a, b) => a.stock - b.stock);
  const key = low.map((i) => `${i.id}:${i.stock > 0 ? "low" : "out"}`).join("|");

  // What has already been announced this session, so the same items don't pop up again on every screen.
  const [seen, setSeen] = useState<string>(() => (typeof window === "undefined" ? "" : readSeen(mode)));
  const [shown, setShown] = useState<Item[]>([]);
  if (popup && rows.length && key !== seen) {
    const before = new Set(seen.split("|").filter(Boolean));
    const fresh = low.filter((i) => !before.has(`${i.id}:${i.stock > 0 ? "low" : "out"}`));
    setSeen(key);
    if (fresh.length) setShown(fresh);
  }

  // Remember for this browser tab; ring once when something new appears.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(seenKey(mode), seen);
    } catch {
      /* private mode: just announce again next time */
    }
  }, [mode, seen]);
  useEffect(() => {
    if (shown.length && sound) playAlarmBeep();
  }, [shown, sound]);

  if (!popup || !shown.length) return null;
  const out = shown.filter((i) => i.stock <= 0).length;
  return (
    <div
      role="alert"
      className="fixed right-4 top-[76px] z-[65] w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-amber-300 bg-white shadow-2xl"
    >
      <div className="flex items-start gap-2.5 bg-amber-50 px-4 py-3">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-amber-900">Low stock alert</p>
          <p className="text-[12px] text-amber-800">
            {shown.length - out > 0 && `${shown.length - out} running low`}
            {shown.length - out > 0 && out > 0 && " · "}
            {out > 0 && `${out} out of stock`}
          </p>
        </div>
        <button onClick={() => setShown([])} aria-label="Dismiss" className="cursor-pointer rounded p-1 text-amber-700 hover:bg-amber-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="max-h-[180px] divide-y divide-[#f3f4f6] overflow-y-auto px-4 text-[12.5px]">
        {shown.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 py-2">
            <span className="truncate font-medium text-gray-900">{i.name}</span>
            <span className={`shrink-0 font-bold ${i.stock > 0 ? "text-amber-700" : "text-red-600"}`}>
              {i.stock > 0 ? `${i.stock} left` : "Out of stock"}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 border-t border-[#f3f4f6] px-4 py-3">
        <button
          onClick={() => {
            setShown([]);
            onView();
          }}
          className="flex-1 cursor-pointer rounded-lg bg-[var(--c-deep)] py-2 text-[12.5px] font-bold text-white hover:bg-[var(--c-hover)]"
        >
          View low stock
        </button>
        <button
          onClick={() => setShown([])}
          className="cursor-pointer rounded-lg border border-[#e3e7ea] px-3 py-2 text-[12.5px] font-semibold text-gray-700 hover:bg-gray-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};
