/* ==========================================================================
   Memberships (optional module — Settings → Membership; off by default)

   A customer pays a fee for a plan and gets its discount on eligible items
   until the membership expires. Plans and members belong to one dashboard;
   the settings are shared, with a switch for each.

   The member discount is its own step after the existing discounts and never
   changes them:
     • Combining allowed: the plan's % on what eligible items cost after their
       automatic discount.
     • Combining not allowed: the customer gets the bigger of the two — the
       member discount only tops up what the existing discounts already gave.
   Items an offer already discounted (unless that offer stacks) and free items
   are not eligible. Minimum bill and maximum discount come from the plan.

   Pure functions, shared by the billing screens (preview) and the server (what
   is actually charged), so the two always agree.
   ========================================================================== */

export const MEMBER_METHODS = ["Cash", "UPI", "Card", "Bank Transfer", "Cheque"];

export type ValidityUnit = "days" | "months" | "years";
export type MemberPaymentStatus = "Paid" | "Pending";

export type MembershipSettings = {
  enabled: boolean;
  retail: boolean;
  wholesale: boolean;
  allow_multiple_plans: boolean;
  /** Pricing and discount defaults, filled into each new plan */
  default_fee: number;
  /** Fee for renewing; 0 = the plan's membership fee */
  renewal_fee: number;
  default_validity_value: number;
  default_validity_unit: ValidityUnit;
  default_percent: number;
  default_min_bill: number;
  default_max_discount: number;
  default_categories: string[];
  /** Member discount on top of existing discounts (else the bigger of the two) */
  allow_combine: boolean;
  /** Show "expiring soon" this many days before expiry */
  reminder_days: number;
  /** Days after expiry the discount keeps working (0 = stops at expiry) */
  grace_days: number;
  allow_renew_after_expiry: boolean;
};

export const DEFAULT_MEMBERSHIP_SETTINGS: MembershipSettings = {
  enabled: false,
  retail: true,
  wholesale: false,
  allow_multiple_plans: true,
  default_fee: 0,
  renewal_fee: 0,
  default_validity_value: 1,
  default_validity_unit: "years",
  default_percent: 0,
  default_min_bill: 0,
  default_max_discount: 0,
  default_categories: [],
  allow_combine: false,
  reminder_days: 30,
  grace_days: 0,
  allow_renew_after_expiry: true,
};

const n = (v: unknown) => {
  const x = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
};
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const whole = (v: unknown) => Math.max(0, Math.floor(n(v)));
const unitOf = (v: unknown): ValidityUnit => (v === "days" || v === "months" ? v : "years");

/** Clean stored / submitted settings. Bad or blank data → off, never a surprise discount. */
export const normaliseMembershipSettings = (raw: unknown): MembershipSettings => {
  let d: Partial<MembershipSettings> = {};
  try {
    d = typeof raw === "string" ? (raw ? JSON.parse(raw) : {}) : ((raw as Partial<MembershipSettings>) ?? {});
  } catch {
    d = {};
  }
  const D = DEFAULT_MEMBERSHIP_SETTINGS;
  return {
    enabled: d.enabled === true,
    retail: d.retail ?? D.retail,
    wholesale: d.wholesale ?? D.wholesale,
    allow_multiple_plans: d.allow_multiple_plans ?? D.allow_multiple_plans,
    default_fee: Math.max(0, r2(n(d.default_fee))),
    renewal_fee: Math.max(0, r2(n(d.renewal_fee))),
    default_validity_value: Math.max(1, whole(d.default_validity_value ?? D.default_validity_value)),
    default_validity_unit: unitOf(d.default_validity_unit ?? D.default_validity_unit),
    default_percent: Math.min(100, Math.max(0, r2(n(d.default_percent)))),
    default_min_bill: Math.max(0, r2(n(d.default_min_bill))),
    default_max_discount: Math.max(0, r2(n(d.default_max_discount))),
    default_categories: Array.isArray(d.default_categories) ? d.default_categories.filter((c) => typeof c === "string") : [],
    allow_combine: d.allow_combine ?? D.allow_combine,
    reminder_days: whole(d.reminder_days ?? D.reminder_days),
    grace_days: whole(d.grace_days ?? D.grace_days),
    allow_renew_after_expiry: d.allow_renew_after_expiry ?? D.allow_renew_after_expiry,
  };
};

export const membershipOn = (s: MembershipSettings | undefined | null, mode: "retail" | "wholesale"): boolean =>
  Boolean(s?.enabled && (mode === "retail" ? s.retail : s.wholesale));

export type MembershipPlan = {
  id: string;
  name: string;
  fee: number;
  validity_value: number;
  validity_unit: ValidityUnit;
  discount_percent: number;
  /** 0 = no minimum */
  min_bill: number;
  /** 0 = no maximum */
  max_discount: number;
  /** Product types the discount applies to; empty = every category */
  categories: string[];
  active: boolean;
};

export type Membership = {
  id: string;
  member_no: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  plan_id: string;
  plan_name: string;
  start_date: string;
  expiry_date: string;
  fee: number;
  payment_method: string;
  payment_status: MemberPaymentStatus;
  active: boolean;
  created_at: string;
};

/** One line of a membership's history: registered, renewed, plan changed… Kept for good. */
export type MembershipEvent = {
  id: string;
  membership_id: string;
  type: string;
  plan_name: string;
  start_date: string;
  expiry_date: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  note: string;
  actor: string;
  created_at: string;
};

export type MembershipData = {
  settings: MembershipSettings;
  plans: MembershipPlan[];
  members: Membership[];
  events: MembershipEvent[];
};

/* --------------------------------- dates --------------------------------- */

const shift = (iso: string, days: number, months: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  // Keep month ends sensible: 31 Jan + 1 month = 28 / 29 Feb, not 3 Mar.
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay) + days);
  return target.toISOString().slice(0, 10);
};

export const addDaysIso = (iso: string, days: number): string => shift(iso, days, 0);

/** Last valid day of a period starting on `start` (1 year from 2026-11-07 → 2027-11-06). */
export const periodEnd = (start: string, value: number, unit: ValidityUnit): string => {
  const v = Math.max(1, whole(value));
  if (unit === "days") return shift(start, v - 1, 0);
  return shift(start, -1, unit === "months" ? v : v * 12);
};

export const validityLabel = (value: number, unit: ValidityUnit): string =>
  `${value} ${value === 1 ? unit.replace(/s$/, "") : unit}`;

/* --------------------------------- status -------------------------------- */

export type MemberStatus = "ACTIVE" | "EXPIRING" | "GRACE" | "EXPIRED" | "UPCOMING" | "PAYMENT PENDING" | "INACTIVE";

export const memberStatus = (
  m: Pick<Membership, "active" | "payment_status" | "start_date" | "expiry_date">,
  date: string,
  s: Pick<MembershipSettings, "reminder_days" | "grace_days">,
): MemberStatus => {
  if (!m.active) return "INACTIVE";
  if (m.payment_status !== "Paid") return "PAYMENT PENDING";
  if (date < m.start_date) return "UPCOMING";
  if (date <= m.expiry_date) return s.reminder_days > 0 && date > addDaysIso(m.expiry_date, -s.reminder_days) ? "EXPIRING" : "ACTIVE";
  return date <= addDaysIso(m.expiry_date, s.grace_days) ? "GRACE" : "EXPIRED";
};

/** Does this status give the discount today? */
export const statusGivesDiscount = (status: MemberStatus): boolean =>
  status === "ACTIVE" || status === "EXPIRING" || status === "GRACE";

export const canRenew = (status: MemberStatus, s: Pick<MembershipSettings, "allow_renew_after_expiry">): boolean =>
  status !== "INACTIVE" && (status !== "EXPIRED" || s.allow_renew_after_expiry);

/** Fee for renewing onto a plan. */
export const renewalFee = (plan: Pick<MembershipPlan, "fee">, s: Pick<MembershipSettings, "renewal_fee">): number =>
  s.renewal_fee > 0 ? s.renewal_fee : plan.fee;

/** New period when renewing: straight after the current one, or from today if it has lapsed. */
export const renewalPeriod = (
  m: Pick<Membership, "expiry_date">,
  plan: Pick<MembershipPlan, "validity_value" | "validity_unit">,
  today: string,
): { start: string; expiry: string } => {
  const start = m.expiry_date >= today ? addDaysIso(m.expiry_date, 1) : today;
  return { start, expiry: periodEnd(start, plan.validity_value, plan.validity_unit) };
};

/** A customer's memberships that give the discount on `date`, best plan first. */
export const usableMembership = (
  members: Membership[],
  plans: MembershipPlan[],
  customer: (m: Membership) => boolean,
  date: string,
  s: MembershipSettings,
): Membership | null => {
  const percent = (m: Membership) => plans.find((p) => p.id === m.plan_id)?.discount_percent ?? 0;
  return (
    members
      .filter((m) => customer(m) && statusGivesDiscount(memberStatus(m, date, s)))
      .sort((a, b) => percent(b) - percent(a) || b.expiry_date.localeCompare(a.expiry_date))[0] ?? null
  );
};

/** What billing shows for a customer: the membership that gives the discount, else their latest one. */
export const memberForBill = (
  data: MembershipData | undefined,
  customerId: string | null | undefined,
  date: string,
): { membership: Membership | null; plan: MembershipPlan | null; status: MemberStatus | null; usable: boolean } => {
  const empty = { membership: null, plan: null, status: null, usable: false };
  if (!data || !customerId) return empty;
  const own = data.members.filter((m) => m.customer_id === customerId);
  if (!own.length) return empty;
  const usable = usableMembership(own, data.plans, () => true, date, data.settings);
  const membership = usable ?? [...own].sort((a, b) => b.expiry_date.localeCompare(a.expiry_date))[0];
  return {
    membership,
    plan: data.plans.find((p) => p.id === membership.plan_id) ?? null,
    status: memberStatus(membership, date, data.settings),
    usable: Boolean(usable),
  };
};

/* -------------------------------- discount ------------------------------- */

export type MemberLine = {
  /** The line's discount category */
  category: string;
  /** What the line costs before the automatic discount */
  amount: number;
  /** Its automatic category discount */
  auto: number;
  /** Already discounted by an offer that doesn't stack */
  excluded?: boolean;
};

export type MemberDiscount = {
  discount: number;
  /** Member discount on each line, in order (they add up to `discount`) */
  lines: number[];
  /** Why there is no discount */
  reason: "" | "min-bill" | "no-eligible" | "existing-better";
  percent: number;
};

/** The member discount on a bill. `otherBillDiscount` = bill-wide discounts already given (bill offers). */
export const calcMemberDiscount = (
  plan: Pick<MembershipPlan, "discount_percent" | "min_bill" | "max_discount" | "categories">,
  s: Pick<MembershipSettings, "allow_combine">,
  lines: MemberLine[],
  otherBillDiscount = 0,
): MemberDiscount => {
  const none = (reason: MemberDiscount["reason"]): MemberDiscount => ({ discount: 0, lines: lines.map(() => 0), reason, percent: plan.discount_percent });
  const subtotal = r2(lines.reduce((t, l) => t + n(l.amount), 0));
  if (plan.min_bill > 0 && subtotal < plan.min_bill) return none("min-bill");
  const wanted = plan.categories.map((c) => c.toLowerCase());
  const eligible = lines.map((l) => !l.excluded && n(l.amount) > 0 && (!wanted.length || wanted.includes(l.category.toLowerCase())));
  if (!eligible.some(Boolean)) return none("no-eligible");
  const pct = Math.min(100, Math.max(0, n(plan.discount_percent))) / 100;
  // What each eligible line can still give: never more than it costs after its automatic discount.
  const room = lines.map((l, i) => (eligible[i] ? Math.max(0, n(l.amount) - n(l.auto)) : 0));
  const roomTotal = room.reduce((t, x) => t + x, 0);
  let total: number;
  if (s.allow_combine) {
    total = roomTotal * pct;
  } else {
    const gross = lines.reduce((t, l, i) => t + (eligible[i] ? n(l.amount) : 0), 0) * pct;
    const already = lines.reduce((t, l, i) => t + (eligible[i] ? n(l.auto) : 0), 0) + Math.max(0, n(otherBillDiscount));
    total = gross - already;
    if (r2(total) <= 0) return none("existing-better");
  }
  total = r2(total);
  if (plan.max_discount > 0) total = Math.min(total, plan.max_discount);
  // Bill-wide discounts already came off, so the bill can never go below zero.
  total = r2(Math.min(total, Math.max(0, roomTotal - Math.max(0, n(otherBillDiscount)))));
  if (total <= 0 || roomTotal <= 0) return none("no-eligible");
  // Share across eligible lines by what they cost; the last takes the rounding paisa.
  const last = room.reduce((at, x, i) => (x > 0 ? i : at), -1);
  let given = 0;
  const out = room.map((x, i) => {
    if (x <= 0) return 0;
    if (i === last) return r2(total - given);
    const part = r2((total * x) / roomTotal);
    given = r2(given + part);
    return part;
  });
  return { discount: total, lines: out, reason: "", percent: plan.discount_percent };
};
