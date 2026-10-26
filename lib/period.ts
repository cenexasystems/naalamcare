/* ==========================================================================
   Date periods used by the dashboard and reports. Calendar boundaries in the
   shop's local time, compared against yyyy-mm-dd bill / purchase dates:
     Today      12:00 am – 11:59 pm today
     This week  Monday – Sunday of the current week
     This month 1st – last day of the current month
     This year  1 Jan – 31 Dec of the current year
   ========================================================================== */

export type Period = "ALL" | "TODAY" | "WEEK" | "MONTH" | "YEAR" | "CUSTOM";

export const PERIOD_LABEL: Record<Exclude<Period, "CUSTOM">, string> = {
  ALL: "All Time",
  TODAY: "Today",
  WEEK: "This Week",
  MONTH: "This Month",
  YEAR: "This Year",
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Inclusive [from, to] yyyy-mm-dd range for a period. Custom ranges with a blank end stay open on that side. */
export const periodRange = (period: Period, from = "", to = "", now = new Date()): [string, string] => {
  switch (period) {
    case "TODAY":
      return [iso(now), iso(now)];
    case "WEEK": {
      // getDay(): Sunday = 0 … Saturday = 6 → days since Monday
      const sinceMonday = (now.getDay() + 6) % 7;
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday);
      const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
      return [iso(monday), iso(sunday)];
    }
    case "MONTH":
      return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
    case "YEAR":
      return [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`];
    case "CUSTOM": {
      const [a, b] = from && to && from > to ? [to, from] : [from, to];
      return [a || "0000-01-01", b || "9999-12-31"];
    }
    default:
      return ["0000-01-01", "9999-12-31"];
  }
};

export const inRange = (date: string, [from, to]: [string, string]) => !!date && date >= from && date <= to;
