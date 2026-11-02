/* ==========================================================================
   Offers & free gifts (retail) — Settings → Offers

   Two kinds of offer, both giving free items as separate ₹0 lines:
     • "buy_get"   Buy X packs of a product, get Y packs free — of the same
                   product (Buy 1 Get 1, Buy 2 Get 1) or of another product
                   (a free gift with that medicine).
     • "bill_gift" A bill of ₹N or more gets Y packs of a gift product.

   Quantities are in packs — a strip, bottle or piece, as the product is
   bought — so "Buy 1 Get 1" on a strip of 10 means 10 tablets bought, 10 free.
   Loose tablets that don't make a whole strip don't count. Free items never
   count towards qualifying for an offer.

   Conflicts: for one product only the highest-priority offer applies; of the
   bill-amount gifts, only the highest threshold the bill reaches applies.
   A free item is only given when it is in stock — another product is never
   substituted.

   Pure functions, shared by the billing screen (preview) and the server
   (what is actually given), so the two always agree.
   ========================================================================== */

export type OfferType = "buy_get" | "bill_gift";

export type Offer = {
  id: string;
  name: string;
  description: string;
  type: OfferType;
  /** buy_get: the product that must be bought */
  buy_medicine_id: string | null;
  /** buy_get: packs to buy for one reward */
  buy_qty: number;
  /** The free product (may be the same as the bought one) */
  reward_medicine_id: string;
  /** Packs given free per reward */
  reward_qty: number;
  /** bill_gift: bill amount (before automatic discounts) needed */
  min_bill: number;
  /** buy_get: give the reward again for every further X packs (Buy 2 → 2 free) */
  repeatable: boolean;
  /** Most free packs on one bill (0 = no limit) */
  max_free_per_bill: number;
  /** yyyy-mm-dd, inclusive; "" = no limit */
  starts_on: string;
  ends_on: string;
  active: boolean;
  /** Higher wins when offers compete for the same product */
  priority: number;
  created_at: string;
};

export type OfferStatus = "active" | "scheduled" | "expired" | "off";

export const offerStatus = (o: Offer, date: string): OfferStatus => {
  if (!o.active) return "off";
  if (o.starts_on && date < o.starts_on) return "scheduled";
  if (o.ends_on && date > o.ends_on) return "expired";
  return "active";
};

/** Badge text, e.g. "BUY 1 GET 1", "BUY 2 GET 1", "FREE GIFT". */
export const offerBadge = (o: Pick<Offer, "type" | "buy_medicine_id" | "reward_medicine_id" | "buy_qty" | "reward_qty">): string =>
  o.type === "bill_gift" || o.buy_medicine_id !== o.reward_medicine_id ? "FREE GIFT" : `BUY ${o.buy_qty} GET ${o.reward_qty}`;

export type PaidLine = { medicine_id: string; qty: number; pack_size: number };

export type RewardPlan = {
  offer: Offer;
  medicine_id: string;
  /** Packs the bill earned */
  earned: number;
  /** Packs actually given (limited by stock) */
  packs: number;
};

/**
 * Which free items a bill gets.
 * `paidSubtotal` is the bill amount before automatic discounts.
 * `stockPacks(medicineId)` is how many whole packs of a product are still free to give after the paid lines.
 */
export const planOffers = (
  offers: Offer[],
  date: string,
  paid: PaidLine[],
  paidSubtotal: number,
  stockPacks: (medicineId: string) => number,
): RewardPlan[] => {
  const live = offers.filter((o) => offerStatus(o, date) === "active" && o.reward_qty > 0 && o.reward_medicine_id);
  const byPriority = (a: Offer, b: Offer) => b.priority - a.priority || b.created_at.localeCompare(a.created_at);

  // Whole packs bought of each product (loose units don't make a pack).
  const bought = new Map<string, number>();
  for (const l of paid) bought.set(l.medicine_id, (bought.get(l.medicine_id) ?? 0) + l.qty / Math.max(1, l.pack_size));

  const chosen: { offer: Offer; earned: number }[] = [];
  // Buy & get: the best offer for each product bought.
  const perProduct = new Map<string, Offer>();
  for (const o of live.filter((x) => x.type === "buy_get" && x.buy_medicine_id && x.buy_qty > 0).sort(byPriority)) {
    if (perProduct.has(o.buy_medicine_id!)) continue;
    const packs = Math.floor((bought.get(o.buy_medicine_id!) ?? 0) + 1e-9);
    const times = Math.floor(packs / o.buy_qty);
    if (times < 1) continue;
    perProduct.set(o.buy_medicine_id!, o);
    chosen.push({ offer: o, earned: (o.repeatable ? times : 1) * o.reward_qty });
  }
  // Bill gift: the highest threshold the bill reaches.
  const gift = live
    .filter((x) => x.type === "bill_gift" && paidSubtotal > 0 && paidSubtotal >= x.min_bill)
    .sort((a, b) => b.min_bill - a.min_bill || byPriority(a, b))[0];
  if (gift) chosen.push({ offer: gift, earned: gift.reward_qty });

  const left = new Map<string, number>();
  return chosen.map(({ offer, earned }) => {
    const capped = offer.max_free_per_bill > 0 ? Math.min(earned, offer.max_free_per_bill) : earned;
    const id = offer.reward_medicine_id;
    const available = left.has(id) ? left.get(id)! : Math.max(0, Math.floor(stockPacks(id)));
    const packs = Math.min(capped, available);
    left.set(id, available - packs);
    return { offer, medicine_id: id, earned: capped, packs };
  });
};

/** Clean an offer submitted from Settings; returns the problems instead of fixing them. */
export const checkOffer = (o: Offer): string[] => {
  const errors: string[] = [];
  if (!o.name.trim()) errors.push("Give the offer a name.");
  if (!o.reward_medicine_id) errors.push("Choose the free product.");
  if (!Number.isInteger(o.reward_qty) || o.reward_qty < 1) errors.push("Free quantity must be 1 or more whole packs.");
  if (o.type === "buy_get") {
    if (!o.buy_medicine_id) errors.push("Choose the product the customer buys.");
    if (!Number.isInteger(o.buy_qty) || o.buy_qty < 1) errors.push("Buy quantity must be 1 or more whole packs.");
  } else if (!(o.min_bill > 0)) errors.push("Enter the bill amount needed for the gift.");
  if (!Number.isInteger(o.max_free_per_bill) || o.max_free_per_bill < 0) errors.push("Free items per bill must be 0 (no limit) or more.");
  if (o.starts_on && o.ends_on && o.ends_on < o.starts_on) errors.push("The end date is before the start date.");
  return errors;
};
