"use client";

import React, { useMemo } from "react";
import {
  IndianRupee,
  Receipt,
  Package,
  AlertTriangle,
  CalendarX2,
  TrendingUp,
  Users,
  ArrowRight,
} from "lucide-react";
import type { Bill, MedicineWithBatches } from "@/lib/types";
import { amount, expiryState, money, monthSlash, timeLabel, todayIso } from "@/lib/format";
import { round2 } from "@/lib/calc";
import { Card, PageTitle, Pill, ValuePopup } from "./ui";
import { useMode } from "./mode-context";
import type { ScreenKey } from "./Sidebar";

export const Dashboard = ({
  medicines,
  bills,
  customerCount,
  onNavigate,
}: {
  medicines: MedicineWithBatches[];
  bills: Bill[];
  customerCount: number;
  onNavigate: (screen: ScreenKey) => void;
}) => {
  const mode = useMode();
  const stats = useMemo(() => {
    const today = todayIso();
    const todayBills = bills.filter((b) => b.bill_date === today);
    const todayRevenue = round2(todayBills.reduce((sum, b) => sum + b.grand_total, 0));
    const totalRevenue = round2(bills.reduce((sum, b) => sum + b.grand_total, 0));
    const todayItems = todayBills.reduce(
      (sum, b) => sum + b.items.reduce((s, i) => s + i.qty, 0),
      0,
    );

    let lowStock = 0;
    let expiring = 0;
    let expired = 0;
    let stockQty = 0;
    let stockValue = 0;

    for (const medicine of medicines) {
      stockQty += medicine.total_stock;
      for (const batch of medicine.batches) {
        stockValue += (batch.stock_qty / (batch.pack_size || 1)) * batch.purchase_rate;
        const state = expiryState(batch.exp_date);
        if (state === "EXPIRED") expired += 1;
        else if (state === "SOON") expiring += 1;
      }
      if (medicine.total_stock > 0 && medicine.total_stock <= medicine.low_stock_threshold)
        lowStock += 1;
    }

    return {
      todayBills: todayBills.length,
      todayRevenue,
      totalRevenue,
      todayItems,
      lowStock,
      expiring,
      expired,
      stockQty,
      stockValue: round2(stockValue),
    };
  }, [medicines, bills]);

  const topMedicines = useMemo(() => {
    const tally = new Map<string, { name: string; qty: number; value: number }>();
    for (const bill of bills) {
      for (const item of bill.items) {
        const current = tally.get(item.medicine_id) || {
          name: item.generic_name,
          qty: 0,
          value: 0,
        };
        current.qty += item.qty;
        current.value += item.line_amount;
        tally.set(item.medicine_id, current);
      }
    }
    return [...tally.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [bills]);

  const attention = useMemo(() => {
    const rows: { name: string; detail: string; tone: "red" | "amber" }[] = [];
    for (const medicine of medicines) {
      for (const batch of medicine.batches) {
        const state = expiryState(batch.exp_date);
        if (state === "EXPIRED")
          rows.push({
            name: `${medicine.generic_name} · ${batch.batch_no}`,
            detail: `Expired ${monthSlash(batch.exp_date)} · Box ${batch.box || "-"}`,
            tone: "red",
          });
        else if (state === "SOON")
          rows.push({
            name: `${medicine.generic_name} · ${batch.batch_no}`,
            detail: `Expires ${monthSlash(batch.exp_date)} · Box ${batch.box || "-"}`,
            tone: "amber",
          });
      }
      if (medicine.total_stock > 0 && medicine.total_stock <= medicine.low_stock_threshold)
        rows.push({
          name: medicine.generic_name,
          detail: `Only ${medicine.total_stock} left in stock`,
          tone: "amber",
        });
    }
    return rows.slice(0, 8);
  }, [medicines]);

  return (
    <div>
      <PageTitle title={mode === "wholesale" ? "Wholesale Overview" : "Retail Overview"} subtitle="Today at a glance" />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<IndianRupee className="h-5 w-5" />}
          label="Today's Revenue"
          value={money(stats.todayRevenue)}
          sub={`${stats.todayItems} units sold today`}
          tone="green"
        />
        <KpiCard
          icon={<Receipt className="h-5 w-5" />}
          label="Today's Bills"
          value={String(stats.todayBills)}
          sub={`${bills.length} bills all time`}
          tone="blue"
        />
        <KpiCard
          icon={<Package className="h-5 w-5" />}
          label="Stock on Hand"
          value={stats.stockQty.toLocaleString("en-IN")}
          sub={`Stock value ₹${amount(stats.stockValue)}`}
          tone="gray"
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Total Revenue"
          value={money(stats.totalRevenue)}
          sub={`${customerCount} registered customers`}
          tone="green"
        />
      </div>

      {/* Alerts row */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <AlertCard
          icon={<AlertTriangle className="h-[18px] w-[18px]" />}
          label="Low Stock Items"
          value={stats.lowStock}
          tone="amber"
          onClick={() => onNavigate("inventory")}
        />
        <AlertCard
          icon={<CalendarX2 className="h-[18px] w-[18px]" />}
          label="Expiring Soon"
          value={stats.expiring}
          tone="amber"
          onClick={() => onNavigate("expiry")}
        />
        <AlertCard
          icon={<CalendarX2 className="h-[18px] w-[18px]" />}
          label="Expired Batches"
          value={stats.expired}
          tone="red"
          onClick={() => onNavigate("expiry")}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Recent bills */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-[#eef1f3] px-4 py-3.5">
            <h3 className="text-[14px] font-bold text-gray-900">Recent Bills</h3>
            <button
              onClick={() => onNavigate("reports")}
              className="flex cursor-pointer items-center gap-1 text-[12.5px] font-semibold text-[#1f6feb] hover:underline"
            >
              View reports <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr className="bg-[#fafbfc] text-gray-600">
                  <th className="th">Bill No</th>
                  <th className="th">Customer</th>
                  <th className="th">Time</th>
                  <th className="th text-center">Items</th>
                  <th className="th text-right">Discount</th>
                  <th className="th text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f3f5]">
                {bills.slice(0, 7).map((bill) => (
                  <tr key={bill.id}>
                    <td className="td font-semibold text-gray-900">{bill.id}</td>
                    <td className="td">
                      {bill.customer_name || "Walk-in Customer"}
                      {bill.customer_phone && (
                        <span className="ml-1.5 text-[11.5px] text-gray-500">
                          {bill.customer_phone}
                        </span>
                      )}
                    </td>
                    <td className="td text-gray-500">{timeLabel(bill.created_at)}</td>
                    <td className="td text-center">{bill.items.length}</td>
                    <td className="td text-right text-[var(--c-deep)]">{amount(bill.discount)}</td>
                    <td className="td text-right font-bold">{money(bill.grand_total)}</td>
                  </tr>
                ))}
                {!bills.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-[13px] text-gray-400">
                      No bills yet — start from the Billing (POS) screen.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Needs attention */}
        <Card>
          <div className="flex items-center justify-between border-b border-[#eef1f3] px-4 py-3.5">
            <h3 className="text-[14px] font-bold text-gray-900">Needs Attention</h3>
            <button
              onClick={() => onNavigate("expiry")}
              className="cursor-pointer text-[12.5px] font-semibold text-[#1f6feb] hover:underline"
            >
              All alerts
            </button>
          </div>
          <div className="divide-y divide-[#f1f3f5]">
            {attention.map((row, index) => (
              <div key={index} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-gray-900">{row.name}</p>
                  <p className="truncate text-[11.5px] text-gray-500">{row.detail}</p>
                </div>
                <Pill tone={row.tone}>{row.tone === "red" ? "EXPIRED" : "CHECK"}</Pill>
              </div>
            ))}
            {!attention.length && (
              <p className="px-4 py-12 text-center text-[13px] text-gray-400">
                Everything looks good.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Top medicines */}
      <Card className="mt-4">
        <div className="flex items-center gap-2 border-b border-[#eef1f3] px-4 py-3.5">
          <Users className="h-[18px] w-[18px] text-gray-500" />
          <h3 className="text-[14px] font-bold text-gray-900">Top Selling Medicines</h3>
        </div>
        <div className="divide-y divide-[#f1f3f5]">
          {topMedicines.map((row, index) => (
            <div key={index} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--c-mint)] text-[12px] font-bold text-[var(--c-deep)]">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-gray-900">
                {row.name}
              </span>
              <span className="text-[12.5px] text-gray-500">{row.qty} units</span>
              <span className="w-[90px] text-right text-[13px] font-bold text-gray-900">
                {money(row.value)}
              </span>
            </div>
          ))}
          {!topMedicines.length && (
            <p className="px-4 py-12 text-center text-[13px] text-gray-400">
              Sales data will appear here once you bill a few items.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
};

const KpiCard = ({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "green" | "blue" | "gray";
}) => {
  const [open, setOpen] = React.useState(false);
  const tones: Record<string, string> = {
    green: "bg-[var(--c-mint)] text-[var(--c-deep)]",
    blue: "bg-[#eaf1fe] text-[#1f6feb]",
    gray: "bg-gray-100 text-gray-600",
  };
  return (
    <>
    <Card
      className="cursor-pointer p-4 transition hover:border-[var(--c-primary)]/40 hover:shadow-md"
      onClick={() => setOpen(true)}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[12.5px] text-gray-500">{label}</p>
          <p className="mt-1 truncate text-[24px] font-extrabold leading-tight text-gray-900">
            {value}
          </p>
          <p className="mt-1 truncate text-[11.5px] text-gray-500">{sub}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          {icon}
        </span>
      </div>
    </Card>
    <ValuePopup open={open} onClose={() => setOpen(false)} icon={icon} iconClass={tones[tone]} label={label} value={value} sub={sub} />
    </>
  );
};

const AlertCard = ({
  icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "amber" | "red";
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-white px-4 py-3.5 text-left transition hover:shadow-sm ${
      tone === "red" ? "border-[#f5d0d0]" : "border-[#f2e2c4]"
    }`}
  >
    <span
      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
        tone === "red" ? "bg-[#fdecec] text-[#dc2626]" : "bg-[#fef4e6] text-[#d97706]"
      }`}
    >
      {icon}
    </span>
    <span className="flex-1">
      <span className="block text-[12.5px] text-gray-500">{label}</span>
      <span className="block text-[20px] font-extrabold text-gray-900">{value}</span>
    </span>
    <ArrowRight className="h-4 w-4 text-gray-400" />
  </button>
);
