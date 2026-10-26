"use client";

import { PERIOD_LABEL, type Period } from "@/lib/period";

const PRESETS: Exclude<Period, "CUSTOM">[] = ["ALL", "TODAY", "WEEK", "MONTH", "YEAR"];

/** Period pills + From / To dates. Picking a date switches to a custom range; picking a pill clears the dates. */
export const PeriodFilter = ({
  period,
  from,
  to,
  onChange,
}: {
  period: Period;
  from: string;
  to: string;
  onChange: (next: { period: Period; from: string; to: string }) => void;
}) => (
  <div className="flex flex-col items-start gap-2.5">
    <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-[#e5e7eb] bg-white px-3 py-1.5 shadow-sm">
      <span className="mr-2 shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-800">Period:</span>
      {PRESETS.map((p) => (
        <button
          key={p}
          onClick={() => onChange({ period: p, from: "", to: "" })}
          className={`shrink-0 cursor-pointer rounded-lg px-3.5 py-1.5 text-[13px] font-extrabold uppercase transition ${
            period === p ? "bg-[var(--c-deep)] text-white shadow-sm" : "text-gray-900 hover:bg-gray-100"
          }`}
        >
          {PERIOD_LABEL[p]}
        </button>
      ))}
    </div>
    <div
      className={`flex max-w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border bg-white px-3 py-2 shadow-sm ${
        period === "CUSTOM" ? "border-[var(--c-primary)]" : "border-[#e5e7eb]"
      }`}
    >
      <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-gray-800">
        From:
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => onChange({ period: e.target.value || to ? "CUSTOM" : "ALL", from: e.target.value, to })}
          className="cursor-pointer bg-transparent text-[14px] font-bold normal-case tracking-normal text-gray-900 outline-none"
        />
      </label>
      <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-gray-800">
        To:
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onChange({ period: e.target.value || from ? "CUSTOM" : "ALL", from, to: e.target.value })}
          className="cursor-pointer bg-transparent text-[14px] font-bold normal-case tracking-normal text-gray-900 outline-none"
        />
      </label>
    </div>
  </div>
);
