"use client";

import React, { useMemo, useState } from "react";
import {
  IndianRupee,
  Receipt,
  Package,
  AlertTriangle,
  CalendarX2,
  TrendingUp,
  Users,
  ArrowRight,
  Wallet,
  Truck,
  ClipboardList,
} from "lucide-react";
import type { Bill, LedgerData, MedicineWithBatches } from "@/lib/types";
import { amount, dateSlash, expiryState, money, monthSlash, timeLabel, todayIso } from "@/lib/format";
import { round2 } from "@/lib/calc";
import { PERIOD_LABEL, inRange, periodRange, type Period } from "@/lib/period";
import { Card, PageTitle, Pill, ValuePopup } from "./ui";
import { PeriodFilter } from "./PeriodFilter";
import { useMode } from "./mode-context";
import type { ScreenKey } from "./Sidebar";

export const Dashboard = ({
  medicines,
  bills,
  customerCount,
  ledger,
  onNavigate,
}: {
  medicines: MedicineWithBatches[];
  bills: Bill[];
  customerCount: number;
  ledger?: LedgerData;
  onNavigate: (screen: ScreenKey) => void;
}) => {
  const mode = useMode();
  const [filter, setFilter] = useState<{ period: Period; from: string; to: string }>({ period: "TODAY", from: "", to: "" });
  const range = useMemo(() => periodRange(filter.period, filter.from, filter.to), [filter]);
  const periodName =
    filter.period === "CUSTOM"
      ? `${filter.from ? dateSlash(filter.from) : "start"} – ${filter.to ? dateSlash(filter.to) : "today"}`
      : PERIOD_LABEL[filter.period];

  /** Bills in the selected period, newest first (by bill date, then time billed). */
  const periodBills = useMemo(
    () =>
      bills
        .filter((b) => inRange(b.bill_date, range))
        .sort((a, b) => b.bill_date.localeCompare(a.bill_date) || b.created_at.localeCompare(a.created_at)),
    [bills, range],
  );

  /* Figures for the selected period, from the transactions themselves
     (sale price and cost captured on each bill line, not today's catalogue);
     returns are taken off. Outstanding is always as of now. */
  const period = useMemo(() => {
    const today = todayIso();
    const batchCost = new Map<string, number>();
    let purchases = 0;
    for (const m of medicines)
      for (const b of m.batches) {
        batchCost.set(b.id, round2(b.purchase_rate / (b.pack_size || 1)));
        if (!b.source_batch_id && inRange(b.purchase_date, range)) purchases += b.purchase_rate * b.qty_packs;
      }
    let sales = 0;
    let cost = 0;
    let units = 0;
    let discount = 0;
    let returns = 0;
    for (const bill of periodBills) {
      discount += bill.discount;
      returns += bill.returned_amount;
      const lines = bill.items.reduce((s, i) => s + i.line_amount, 0);
      const f = lines > 0 ? bill.grand_total / lines : 1;
      for (const i of bill.items) {
        const net = i.qty - i.returned_qty;
        units += net;
        sales += i.per_unit_price * net * f;
        cost += (i.cost_per_unit || batchCost.get(i.batch_id) || 0) * net;
      }
    }
    let outstanding = 0;
    let overdue = 0;
    for (const bill of bills) {
      outstanding += bill.due_amount;
      if (bill.due_amount > 0 && bill.due_date && bill.due_date < today) overdue += bill.due_amount;
    }
    const profit = round2(sales - cost);
    return {
      sales: round2(sales),
      count: periodBills.length,
      units,
      discount: round2(discount),
      returns: round2(returns),
      profit,
      margin: sales > 0 ? (profit / sales) * 100 : 0,
      purchases: round2(purchases),
      outstanding: round2(outstanding),
      overdue: round2(overdue),
      pendingOrders: (ledger?.purchaseOrders ?? []).filter((o) => o.status === "ORDERED"),
    };
  }, [medicines, bills, periodBills, range, ledger]);

  const stats = useMemo(() => {
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
      lowStock,
      expiring,
      expired,
      stockQty,
      stockValue: round2(stockValue),
    };
  }, [medicines]);

  /** Best sellers in the period by units sold (returns taken off), then by value. */
  const topMedicines = useMemo(() => {
    const tally = new Map<string, { name: string; qty: number; value: number }>();
    for (const bill of periodBills) {
      for (const item of bill.items) {
        const net = item.qty - item.returned_qty;
        if (net <= 0) continue;
        const current = tally.get(item.medicine_id) || {
          name: item.generic_name,
          qty: 0,
          value: 0,
        };
        current.qty += net;
        current.value += item.per_unit_price * net;
        tally.set(item.medicine_id, current);
      }
    }
    return [...tally.values()].sort((a, b) => b.qty - a.qty || b.value - a.value).slice(0, 5);
  }, [periodBills]);

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
      <PageTitle
        title={mode === "wholesale" ? "Wholesale Overview" : "Retail Overview"}
        subtitle={`Showing ${periodName}`}
      />

      <div className="mb-4">
        <PeriodFilter period={filter.period} from={filter.from} to={filter.to} onChange={setFilter} />
      </div>

      {/* Selected period — sales, bills, profit */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<IndianRupee className="h-5 w-5" />}
          label={`Revenue · ${periodName}`}
          value={money(period.sales)}
          sub={`${period.units} units sold${period.returns > 0 ? ` · ${money(period.returns)} returned` : ""}`}
          tone="green"
        />
        <KpiCard
          icon={<Receipt className="h-5 w-5" />}
          label={`Bills · ${periodName}`}
          value={String(period.count)}
          sub={`${money(period.discount)} discount given`}
          tone="blue"
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label={`Profit · ${periodName}`}
          value={money(period.profit)}
          sub={`${period.margin.toFixed(1)}% margin`}
          tone="green"
        />
        <KpiCard
          icon={<Truck className="h-5 w-5" />}
          label={`Purchases · ${periodName}`}
          value={money(period.purchases)}
          sub="Stock received, at cost"
          tone="gray"
        />
      </div>

      {/* As of now — stock, receivables, orders */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          icon={<Package className="h-5 w-5" />}
          label="Stock on Hand"
          value={stats.stockQty.toLocaleString("en-IN")}
          sub={`Stock value ₹${amount(stats.stockValue)}`}
          tone="gray"
        />
        <KpiCard
          icon={<Wallet className="h-5 w-5" />}
          label={mode === "wholesale" ? "Receivables" : "Customer Outstanding"}
          value={money(period.outstanding)}
          sub={period.overdue > 0 ? `${money(period.overdue)} overdue` : "Nothing overdue"}
          tone="blue"
        />
        {mode === "wholesale" ? (
          <KpiCard
            icon={<ClipboardList className="h-5 w-5" />}
            label="Pending Purchase Orders"
            value={String(period.pendingOrders.length)}
            sub={
              period.pendingOrders.length
                ? `₹${amount(period.pendingOrders.reduce((s, o) => s + o.items.reduce((t, i) => t + i.packs * i.rate, 0), 0))} on order`
                : "No open orders"
            }
            tone="blue"
          />
        ) : (
          <KpiCard
            icon={<Users className="h-5 w-5" />}
            label="Customers"
            value={String(customerCount)}
            sub="Registered customers"
            tone="blue"
          />
        )}
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
            <h3 className="text-[14px] font-bold text-gray-900">
              Bills · {periodName}
              {periodBills.length > 10 && (
                <span className="ml-1.5 text-[12px] font-medium text-gray-500">(latest 10 of {periodBills.length})</span>
              )}
            </h3>
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
                  <th className="th">Date &amp; Time</th>
                  <th className="th text-center">Items</th>
                  <th className="th text-right">Discount</th>
                  <th className="th text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f3f5]">
                {periodBills.slice(0, 10).map((bill) => (
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
                    <td className="td whitespace-nowrap text-gray-500">
                      {dateSlash(bill.bill_date)} · {timeLabel(bill.created_at)}
                    </td>
                    <td className="td text-center">{bill.items.length}</td>
                    <td className="td text-right text-[var(--c-deep)]">{amount(bill.discount)}</td>
                    <td className="td text-right font-bold">{money(bill.grand_total)}</td>
                  </tr>
                ))}
                {!periodBills.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-[13px] text-gray-400">
                      {bills.length ? `No bills in ${periodName}.` : "No bills yet — start from the Billing (POS) screen."}
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
          <h3 className="text-[14px] font-bold text-gray-900">Top Selling Medicines · {periodName}</h3>
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
