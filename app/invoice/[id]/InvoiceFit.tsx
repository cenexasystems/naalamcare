"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Shows the A4 invoice at its real width and scales the whole sheet down to
 * fit narrow screens (phones), so the item grid and boxes never spill past the
 * page. Printing ignores the scale and uses the full A4 layout.
 */
export function InvoiceFit({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !sheet.current) return;
      const scale = Math.min(1, outer.current.clientWidth / sheet.current.offsetWidth);
      setFit({ scale, height: sheet.current.offsetHeight * scale });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (outer.current) observer.observe(outer.current);
    if (sheet.current) observer.observe(sheet.current);
    return () => observer.disconnect();
  }, []);

  const scaled = fit.scale < 1;
  return (
    <div
      ref={outer}
      className="invoice-fit w-full max-w-[210mm] overflow-hidden print:!h-auto print:max-w-none print:overflow-visible"
      style={scaled ? { height: fit.height } : undefined}
    >
      <div
        ref={sheet}
        className="w-[210mm] origin-top-left print:!w-auto print:!transform-none"
        style={scaled ? { transform: `scale(${fit.scale})` } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
