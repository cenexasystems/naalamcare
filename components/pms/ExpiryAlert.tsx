"use client";

import React, { useMemo, useState } from "react";
import { CalendarX2, CalendarClock, ArrowDownCircle, Download, Search } from "lucide-react";
import { amount, expiryState, monthSlash, monthsToExpiry, unitNoun } from "@/lib/format";
import type { BatchRow } from "@/lib/store";
import { useSettings } from "./data";
import { downloadExcel } from "@/lib/xlsx";
import { Button, Card, PageTitle, StatTile } from "./ui";
import { monthShort } from "@/lib/format";

type Tab = "expired" | "soon" | "low";

export const ExpiryAlert = ({
  rows,
  initialTab = "soon",
}: {
  rows: BatchRow[];
  initialTab?: Tab;
}) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState("");
  const { data: settings } = useSettings();
  const alertMonths = settings?.expiry_alert_months ?? 6;

  const buckets = useMemo(() => {
    const expired: typeof rows = [];
    const soon: typeof rows = [];
    const low: typeof rows = [];
    for (const row of rows) {
      const state = expiryState(row.batch.exp_date, alertMonths);
      if (state === "EXPIRED") expired.push(row);
      else if (state === "SOON") soon.push(row);
      if (row.batch.stock_qty <= row.medicine.low_stock_threshold) low.push(row);
    }
    const byExpiry = (a: typeof rows[number], b: typeof rows[number]) =>
      a.batch.exp_date.localeCompare(b.batch.exp_date);
    return {
      expired: expired.sort(byExpiry),
      soon: soon.sort(byExpiry),
      low: low.sort((a, b) => a.batch.stock_qty - b.batch.stock_qty),
    };
  }, [rows, alertMonths]);

  const active = buckets[tab];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return active;
    return active.filter(
      ({ batch, medicine }) =>
        medicine.generic_name.toLowerCase().includes(q) ||
        batch.brand_name.toLowerCase().includes(q) ||
        batch.batch_no.toLowerCase().includes(q) ||
        batch.box.toLowerCase().includes(q),
    );
  }, [active, search]);

  const exportList = () => {
    downloadExcel(
      [
        {
          name: tab === "low" ? "Low Stock" : tab === "expired" ? "Expired" : "Expiring Soon",
          columns: [
            { header: "Sno", width: 6 },
            { header: "Generic name", width: 24 },
            { header: "Brand name", width: 18 },
            { header: "Category", width: 12 },
            { header: "Box", width: 8 },
            { header: "Batch no", width: 16 },
            { header: "MFG DT", width: 11 },
            { header: "EXP DT", width: 11 },
            { header: "Quantity", width: 11 },
            { header: "MRP (₹)", width: 11 },
            { header: "Selling price (₹)", width: 16 },
            { header: "Status", width: 18 },
          ],
          rows: filtered.map(({ batch, medicine }, index) => [
            index + 1,
            medicine.generic_name,
            batch.brand_name || medicine.brand_name,
            medicine.schedule,
            batch.box,
            batch.batch_no,
            monthShort(batch.mfg_date),
            monthShort(batch.exp_date),
            batch.stock_qty,
            batch.mrp,
            batch.selling_price,
            tab === "low"
              ? "Low stock"
              : tab === "expired"
                ? "Expired"
                : `Expires in ${Math.max(0, monthsToExpiry(batch.exp_date))} month(s)`,
          ]),
        },
      ],
      `expiry-alert-${tab}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "expired", label: "Expired", count: buckets.expired.length },
    { key: "soon", label: `Expiring in ${alertMonths} months`, count: buckets.soon.length },
    { key: "low", label: "Low stock", count: buckets.low.length },
  ];

  return (
    <div>
      <PageTitle
        title="Expiry Alert"
        subtitle="Batches that need attention"
        right={
          <Button variant="ghost" onClick={exportList}>
            <Download className="h-4 w-4" /> Export list
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([
          ["Expired batches", buckets.expired, "red", <CalendarX2 key="i" className="h-5 w-5" />],
          ["Expiring soon", buckets.soon, "amber", <CalendarClock key="i" className="h-5 w-5" />],
          ["Low stock batches", buckets.low, "amber", <ArrowDownCircle key="i" className="h-5 w-5" />],
        ] as const).map(([label, list, tone, icon]) => (
          <StatTile key={label} icon={icon} label={label} value={list.length} tone={tone} />
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-[#d8dde3]">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`cursor-pointer px-4 py-2 text-[13px] font-semibold transition ${
                tab === t.key ? "bg-[var(--c-deep)] text-white" : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search medicine, batch or box"
            className="h-11 w-full rounded-lg border border-[#e2e6ea] bg-white pl-10 pr-3 text-[13.5px] outline-none transition placeholder:text-gray-400 focus:border-[var(--c-primary)]"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px]">
            <thead>
              <tr className="bg-[#f4f6f8] text-gray-700">
                <th className="th">S.No</th>
                <th className="th">Generic Name</th>
                <th className="th">Brand Name</th>
                <th className="th">Box</th>
                <th className="th">Batch No</th>
                <th className="th">MFG DT</th>
                <th className="th">EXP DT</th>
                <th className="th text-right">Quantity</th>
                <th className="th text-right">MRP (₹)</th>
                <th className="th text-right">Selling Price (₹)</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f3f5]">
              {filtered.map(({ batch, medicine }, index) => {
                const months = monthsToExpiry(batch.exp_date);
                const state = expiryState(batch.exp_date, alertMonths);
                return (
                  <tr key={batch.id} className="transition hover:bg-[#fafbfc]">
                    <td className="td text-gray-500">{index + 1}</td>
                    <td className="td font-medium text-gray-900">{medicine.generic_name}</td>
                    <td className="td">{medicine.brand_name}</td>
                    <td className="td">
                      <span className="inline-flex min-w-[30px] justify-center rounded-md bg-[#eaf1fe] px-2 py-0.5 text-[11.5px] font-bold text-[#1f6feb]">
                        {batch.box || "-"}
                      </span>
                    </td>
                    <td className="td">{batch.batch_no}</td>
                    <td className="td">{monthSlash(batch.mfg_date)}</td>
                    <td
                      className={`td font-semibold ${
                        state === "EXPIRED"
                          ? "text-[#dc2626]"
                          : state === "SOON"
                            ? "text-[#d97706]"
                            : "text-[#00897b]"
                      }`}
                    >
                      {monthSlash(batch.exp_date)}
                    </td>
                    <td className="td text-right font-semibold">
                      {batch.stock_qty}{" "}
                      <span className="text-[11px] font-normal text-gray-500">
                        {unitNoun(batch.purchase_unit_type, batch.pack_size)}
                      </span>
                    </td>
                    <td className="td text-right">{amount(batch.mrp)}</td>
                    <td className="td text-right">{amount(batch.selling_price)}</td>
                    <td className="td">
                      {tab === "low" ? (
                        <span className="text-[12.5px] font-semibold text-[#d97706]">
                          Only {batch.stock_qty} left
                        </span>
                      ) : state === "EXPIRED" ? (
                        <span className="text-[12.5px] font-semibold text-[#dc2626]">
                          Expired {Math.abs(months)} month(s) ago
                        </span>
                      ) : (
                        <span className="text-[12.5px] font-semibold text-[#d97706]">
                          Expires in {Math.max(0, months)} month(s)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-[13.5px] text-gray-400">
                    Nothing to show here — all clear.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
