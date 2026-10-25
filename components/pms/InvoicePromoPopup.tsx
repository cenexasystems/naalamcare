"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { InvoicePromo } from "@/lib/promo";

/** The offer card itself, over a dimmed backdrop; ✕ or tapping outside closes it. */
export const PromoCard = ({
  promo,
  shopName,
  onClose,
}: {
  promo: InvoicePromo;
  shopName: string;
  onClose: () => void;
}) => {
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
          className="absolute -right-2.5 -top-2.5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-[3px] border-white bg-[#e31e24] text-white shadow-lg transition hover:scale-105"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={3} />
        </button>

        <div
          className="max-h-[78vh] overflow-y-auto rounded-[12px] px-5 pb-5 pt-7 text-center text-white"
          style={{ backgroundColor: promo.color }}
        >
          {promo.title && (
            <p className="text-[56px] font-black uppercase leading-[0.9] tracking-tight [overflow-wrap:anywhere]">
              {promo.title}
            </p>
          )}
          {promo.subtitle && <p className="mt-3 text-[15px] font-semibold leading-snug opacity-95">{promo.subtitle}</p>}

          <div className="mt-5 space-y-4 text-left">
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
            <div className="mt-5 flex items-end justify-between gap-3 text-left text-[10.5px] leading-snug opacity-90">
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
export function InvoicePromoPopup({ promo, shopName }: { promo: InvoicePromo; shopName: string }) {
  const [open, setOpen] = useState(true);
  if (!open || !promo.enabled) return null;
  return <PromoCard promo={promo} shopName={shopName} onClose={() => setOpen(false)} />;
}
