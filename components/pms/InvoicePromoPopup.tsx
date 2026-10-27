"use client";

import { useEffect, useState } from "react";
import { HeartPulse, Pill, PillBottle, Stethoscope, Syringe, Tablets, X } from "lucide-react";
import type { InvoicePromo } from "@/lib/promo";

/** Faint medicine artwork scattered behind the offer text. */
const BACKDROP = [
  { Icon: Pill, cls: "-left-3 top-6 h-16 w-16 -rotate-[30deg]" },
  { Icon: Tablets, cls: "right-2 top-24 h-14 w-14 rotate-12" },
  { Icon: Syringe, cls: "-left-2 bottom-24 h-14 w-14 rotate-45" },
  { Icon: PillBottle, cls: "-right-3 bottom-10 h-20 w-20 -rotate-12" },
  { Icon: HeartPulse, cls: "left-1/2 top-1 h-10 w-10 -translate-x-1/2" },
];

/** The offer card itself, over a dimmed backdrop; ✕ or tapping outside closes it. */
export const PromoCard = ({
  promo,
  shopName,
  appColor = "var(--c-deep)",
  onClose,
}: {
  promo: InvoicePromo;
  shopName: string;
  /** The app's theme colour, used when the pop-up has no colour of its own */
  appColor?: string;
  onClose: () => void;
}) => {
  const color = promo.color || appColor;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-5 print:hidden"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={promo.title || "Offers"}
    >
      <div
        className="relative w-full max-w-[360px] rounded-[22px] bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close offers"
          style={{ backgroundColor: color }}
          className="absolute -right-2.5 -top-2.5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-[3px] border-white text-white shadow-lg transition hover:scale-105"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={3} />
        </button>

        <div
          className="relative max-h-[78vh] overflow-y-auto overflow-x-hidden rounded-[12px] px-5 pb-5 pt-7 text-center text-white"
          style={{ backgroundColor: color }}
        >
          {BACKDROP.map(({ Icon, cls }, i) => (
            <Icon key={i} aria-hidden className={`pointer-events-none absolute opacity-[0.13] ${cls}`} strokeWidth={1.6} />
          ))}
          <div className="relative mb-3 flex items-center justify-center gap-2">
            {[Pill, Tablets, Syringe, Stethoscope].map((Icon, i) => (
              <span key={i} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
            ))}
          </div>
          {promo.title && (
            <p className="text-[56px] font-black uppercase leading-[0.9] tracking-tight [overflow-wrap:anywhere]">
              {promo.title}
            </p>
          )}
          {promo.subtitle && <p className="mt-3 text-[15px] font-semibold leading-snug opacity-95">{promo.subtitle}</p>}

          <div className="relative mt-5 space-y-4 rounded-xl bg-white/10 p-3 text-left">
            {promo.groups.map((group, gi) => (
              <div key={gi}>
                {group.heading && (
                  <p className="mb-1.5 border-b border-white/40 pb-1 text-[13px] font-extrabold uppercase tracking-[0.14em]">
                    {group.heading}
                  </p>
                )}
                {group.rows.map((row, ri) => (
                  <div key={ri} className="flex items-baseline justify-between gap-3 py-[3px]">
                    <span className="text-[14px] font-medium">{row.label}</span>
                    <span className="shrink-0 text-[19px] font-black">{row.discount}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {(promo.footnote || shopName) && (
            <div className="relative mt-5 flex items-end justify-between gap-3 text-left text-[10.5px] leading-snug opacity-90">
              <span>{promo.footnote}</span>
              <span className="shrink-0 font-bold">{shopName}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Customer invoice link: shows the pop-up once when the page opens. */
export function InvoicePromoPopup({ promo, shopName, appColor }: { promo: InvoicePromo; shopName: string; appColor: string }) {
  const [open, setOpen] = useState(true);
  if (!open || !promo.enabled) return null;
  return <PromoCard promo={promo} shopName={shopName} appColor={appColor} onClose={() => setOpen(false)} />;
}
