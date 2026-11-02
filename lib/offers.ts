/* ==========================================================================
   Offers & promotions (retail) — Settings → Offers

   Three kinds of offer:
     • "buy_get"   Buy X packs of a product — or of any product in a category —
                   and get Y packs of a reward product FREE, at a % off, or at a
                   promotional price per pack. Same product = Buy 1 Get 1 style;
                   a different product = a gift with purchase.
     • "bill_gift" A bill of ₹N or more gets Y packs of a gift product.
     • "price_off" Buy at least X packs of a product / category and those lines
                   get a % off, ₹ off per pack, or a promotional price per pack.

   Quantities are whole packs (strip / bottle / piece). Loose units that don't
   make a pack don't count, and reward items never count towards qualifying.

   Conflicts: offers are tried highest priority first, and each bill line can
   be claimed by only one buy_get / price_off offer — two offers never act on
   the same quantity. Of the bill-amount gifts, only the highest threshold the
   bill reaches applies.

   Rewards are only given when in stock; nothing is substituted. Offers with
   "apply automatically" off are only applied when the counter accepts them.
   Limits per customer / in total are checked by the server from saved bills.

   Pure functions, shared by the billing screen (preview) and the server (what
   is actually charged and given), so the two always agree.
   ========================================================================== */

export type OfferType = "buy_get" | "bill_gift" | "price_off";
/** How a reward is priced: free, a % off its selling price, or a fixed price per pack */
export type RewardMode = "free" | "percent" | "price";
/** How a price_off offer changes a line: % off, ₹ off per pack, or a fixed price per pack */
export type OffMode = "percent" | "amount" | "price";

export type Offer = {
  id: string;
  name: string;
  description: string;
  type: OfferType;
  /** buy_get / price_off: the product bought (or null when a category is used) */
  buy_medicine_id: string | null;
  /** buy_get / price_off: any product of this Product Type qualifies ("" = use the product) */
  buy_category: string;
  /** Packs to buy for one reward (buy_get) / at least (price_off) */
  buy_qty: number;
  /** buy_get / bill_gift: the reward product */
  reward_medicine_id: string | null;
  /** Packs given per reward */
  reward_qty: number;
  reward_mode: RewardMode;
  /** % off (percent) or ₹ per pack (price) */
  reward_value: number;
  off_mode: OffMode;
  /** % off, ₹ off per pack, or the promotional price per pack */
  off_value: number;
  /** bill_gift: bill amount (before automatic discounts) needed */
  min_bill: number;
  /** buy_get: give again for every further X packs */
  repeatable: boolean;
  /** Most reward packs on one bill (0 = no limit) */
  max_free_per_bill: number;
  /** Times one customer can get it (0 = no limit) */
  max_per_customer: number;
  /** Times it can be used in all (0 = no limit) */
  max_total: number;
  /** yyyy-mm-dd, inclusive; "" = no limit */
  starts_on: string;
  ends_on: string;
  active: boolean;
  /** Off = the counter must accept the offer on the bill */
  auto_apply: boolean;
  /** May the automatic category discount also apply to lines this offer discounts? (never on free items) */
  stack_auto: boolean;
  /** Higher is tried first */
  priority: number;
  created_at: string;
};

export type OfferStatus = "active" | "scheduled" | "expired" | "off";

export const offerStatus = (o: Pick<Offer, "active" | "starts_on" | "ends_on">, date: string): OfferStatus => {
  if (!o.active) return "off";
  if (o.starts_on && date < o.starts_on) return "scheduled";
  if (o.ends_on && date > o.ends_on) return "expired";
  return "active";
};

/** Badge text: "BUY 1 GET 1", "BUY 2 GET 1 AT 50% OFF", "FREE GIFT", "SPECIAL OFFER". */
export const offerBadge = (o: Pick<Offer, "type" | "buy_medicine_id" | "buy_category" | "reward_medicine_id" | "buy_qty" | "reward_qty" | "reward_mode" | "reward_value">): string => {
  if (o.type === "price_off") return "SPECIAL OFFER";
  if (o.type === "bill_gift") return "FREE GIFT";
  const same = !o.buy_category && o.buy_medicine_id === o.reward_medicine_id;
  if (o.reward_mode === "percent") return `BUY ${o.buy_qty} GET ${o.reward_qty} AT ${o.reward_value}% OFF`;
  if (o.reward_mode === "price") return `BUY ${o.buy_qty} GET ${o.reward_qty} AT ₹${o.reward_value}`;
  return same ? `BUY ${o.buy_qty} GET ${o.reward_qty}` : "FREE GIFT";
};

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export type PaidLine = { medicine_id: string; product_type?: string; qty: number; pack_size: number; amount: number };

export type RewardPlan = {
  offer: Offer;
  medicine_id: string;
  /** Packs the bill earned (after the per-bill cap) */
  earned: number;
  /** Packs actually given (limited by stock) */
  packs: number;
};

export type LineDiscount = { index: number; offer: Offer; amount: number };

export type OfferPlan = {
  rewards: RewardPlan[];
  /** price_off discounts on paid lines */
  lineDiscounts: LineDiscount[];
  /** Paid lines claimed by an offer (index → offer), so other offers / stacking rules know */
  claimed: Map<number, Offer>;
  /** Offers that need the counter's OK and that this bill qualifies for */
  available: Offer[];
};

/** Price of one reward unit, from the reward batch's selling price per unit. */
export const rewardUnitPrice = (o: Pick<Offer, "reward_mode" | "reward_value">, sellingPerUnit: number, packSize: number): number => {
  if (o.reward_mode === "percent") return r2(sellingPerUnit * (1 - Math.min(100, Math.max(0, o.reward_value)) / 100));
  if (o.reward_mode === "price") return r2(Math.min(sellingPerUnit, Math.max(0, o.reward_value) / Math.max(1, packSize)));
  return 0;
};

/** Discount on one paid line from a price_off offer. */
const priceOffAmount = (o: Offer, line: PaidLine): number => {
  const packs = line.qty / Math.max(1, line.pack_size);
  const amount = Math.max(0, line.amount);
  if (o.off_mode === "percent") return r2((amount * Math.min(100, Math.max(0, o.off_value))) / 100);
  if (o.off_mode === "amount") return Math.min(amount, r2(Math.max(0, o.off_value) * packs));
  // Promotional price per pack: charge that instead (never more than the normal price).
  return Math.max(0, r2(amount - Math.max(0, o.off_value) * packs));
};

/**
 * What offers do to a bill.
 * `stockPacks(id)` = whole packs of a product still free to give after the paid lines.
 * `accepted` = ids of "apply automatically: off" offers the counter accepted.
 * `canUse(offer)` = the per-customer / total limits (the server knows; the screen assumes yes).
 */
export const planOffers = (
  offers: Offer[],
  ctx: {
    date: string;
    paid: PaidLine[];
    paidSubtotal: number;
    stockPacks: (medicineId: string) => number;
    accepted?: Set<string>;
    canUse?: (offer: Offer) => boolean;
  },
): OfferPlan => {
  const usable = offers
    .filter((o) => offerStatus(o, ctx.date) === "active" && (ctx.canUse ? ctx.canUse(o) : true))
    .sort((a, b) => b.priority - a.priority || b.created_at.localeCompare(a.created_at));
  const accepted = ctx.accepted ?? new Set<string>();
  const claimed = new Map<number, Offer>();
  const rewards: { offer: Offer; earned: number; medicine_id: string }[] = [];
  const lineDiscounts: LineDiscount[] = [];
  const available: Offer[] = [];

  const matches = (o: Offer, l: PaidLine) =>
    o.buy_category
      ? (l.product_type || "").toLowerCase() === o.buy_category.toLowerCase()
      : Boolean(o.buy_medicine_id) && l.medicine_id === o.buy_medicine_id;

  for (const o of usable) {
    if (o.type === "bill_gift") continue;
    if (o.buy_qty < 1) continue;
    const idx = ctx.paid.map((l, i) => (!claimed.has(i) && matches(o, l) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const packs = Math.floor(idx.reduce((s, i) => s + ctx.paid[i].qty / Math.max(1, ctx.paid[i].pack_size), 0) + 1e-9);
    const times = Math.floor(packs / o.buy_qty);
    if (times < 1) continue;
    if (o.type === "buy_get" && (!o.reward_medicine_id || o.reward_qty < 1)) continue;
    if (!o.auto_apply && !accepted.has(o.id)) {
      available.push(o);
      continue;
    }
    idx.forEach((i) => claimed.set(i, o));
    if (o.type === "buy_get") {
      rewards.push({ offer: o, earned: (o.repeatable ? times : 1) * o.reward_qty, medicine_id: o.reward_medicine_id! });
    } else {
      for (const i of idx) {
        const amount = priceOffAmount(o, ctx.paid[i]);
        if (amount > 0) lineDiscounts.push({ index: i, offer: o, amount });
      }
    }
  }

  // Bill-amount gift: the highest threshold reached.
  const gifts = usable
    .filter((o) => o.type === "bill_gift" && o.reward_medicine_id && o.reward_qty > 0 && ctx.paidSubtotal > 0 && ctx.paidSubtotal >= o.min_bill)
    .sort((a, b) => b.min_bill - a.min_bill || b.priority - a.priority);
  const gift = gifts[0];
  if (gift) {
    if (!gift.auto_apply && !accepted.has(gift.id)) available.push(gift);
    else rewards.push({ offer: gift, earned: gift.reward_qty, medicine_id: gift.reward_medicine_id! });
  }

  const left = new Map<string, number>();
  return {
    rewards: rewards.map(({ offer, earned, medicine_id }) => {
      const capped = offer.max_free_per_bill > 0 ? Math.min(earned, offer.max_free_per_bill) : earned;
      const available = left.has(medicine_id) ? left.get(medicine_id)! : Math.max(0, Math.floor(ctx.stockPacks(medicine_id)));
      const packs = Math.min(capped, available);
      left.set(medicine_id, available - packs);
      return { offer, medicine_id, earned: capped, packs };
    }),
    lineDiscounts,
    claimed,
    available,
  };
};

/** Problems with an offer submitted from Settings ([] = valid). */
export const checkOffer = (o: Offer): string[] => {
  const errors: string[] = [];
  if (!o.name.trim()) errors.push("Give the offer a name.");
  const whole = (n: number) => Number.isInteger(n) && n >= 0;
  if (o.type !== "bill_gift") {
    if (!o.buy_medicine_id && !o.buy_category) errors.push("Choose the product or category the customer buys.");
    if (!Number.isInteger(o.buy_qty) || o.buy_qty < 1) errors.push("Buy quantity must be 1 or more whole packs.");
  } else if (!(o.min_bill > 0)) errors.push("Enter the bill amount needed for the gift.");
  if (o.type !== "price_off") {
    if (!o.reward_medicine_id) errors.push("Choose the reward product.");
    if (!Number.isInteger(o.reward_qty) || o.reward_qty < 1) errors.push("Reward quantity must be 1 or more whole packs.");
    if (o.reward_mode === "percent" && !(o.reward_value > 0 && o.reward_value < 100)) errors.push("Reward discount must be between 0% and 100%.");
    if (o.reward_mode === "price" && !(o.reward_value > 0)) errors.push("Enter the reward's promotional price per pack.");
  } else {
    if (o.off_mode === "percent" && !(o.off_value > 0 && o.off_value <= 100)) errors.push("Discount must be between 0% and 100%.");
    if (o.off_mode !== "percent" && !(o.off_value > 0)) errors.push("Enter the amount for the offer.");
  }
  if (!whole(o.max_free_per_bill) || !whole(o.max_per_customer) || !whole(o.max_total))
    errors.push("Limits must be whole numbers (0 = no limit).");
  if (o.starts_on && o.ends_on && o.ends_on < o.starts_on) errors.push("The end date is before the start date.");
  return errors;
};
