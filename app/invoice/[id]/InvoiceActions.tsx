"use client";

import { useEffect, useState } from "react";
import { Printer, Copy, Check } from "lucide-react";

export function InvoiceActions() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const search = new URLSearchParams(window.location.search);
      if (search.get("print") === "1") {
        const timer = setTimeout(() => window.print(), 500);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button 
        onClick={handleCopyLink}
        className="flex items-center gap-2 bg-white hover:bg-[#FAFAFA] text-[#1a1d21] hover:text-[var(--c-deep)] font-bold text-xs uppercase tracking-wider px-4 py-2 rounded-lg shadow-sm border border-[var(--c-deep)]/30 transition-colors cursor-pointer"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-teal-600" /> Copied!
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" /> Copy Link
          </>
        )}
      </button>
      <button 
        onClick={handlePrint}
        className="flex items-center gap-2 bg-gradient-to-r from-[var(--c-deep)] via-[var(--c-deep)] to-[var(--c-deep)] hover:brightness-105 text-white font-bold text-xs uppercase tracking-wider px-5 py-2 rounded-lg shadow-md transition-all cursor-pointer"
      >
        <Printer className="w-4 h-4" /> Download PDF / Print
      </button>
    </div>
  );
}
