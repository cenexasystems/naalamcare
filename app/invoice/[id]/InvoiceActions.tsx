"use client";

import { useEffect, useState } from "react";
import { Printer, Copy, Check, MessageCircle } from "lucide-react";

/** wa.me wants the number with country code and digits only; 10-digit numbers are Indian mobiles. */
const whatsappNumber = (phone: string): string => {
  const digits = (phone || "").replace(/\D/g, "").replace(/^0+/, "");
  return digits.length === 10 ? `91${digits}` : digits;
};

export function InvoiceActions({
  sharePath,
  canShare,
  phone,
  message,
}: {
  /** Signed link that opens this bill without a login */
  sharePath: string;
  /** False when a customer is viewing through the share link */
  canShare: boolean;
  phone: string;
  message: string;
}) {
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

  const shareUrl = () => `${window.location.origin}${sharePath}`;

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(shareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(`${message}\nView / download your bill: ${shareUrl()}`);
    window.open(`https://wa.me/${whatsappNumber(phone)}?text=${text}`, "_blank");
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {canShare && (
        <>
          <button
            onClick={handleWhatsApp}
            className="flex items-center gap-2 bg-[#25D366] hover:brightness-95 text-white font-bold text-xs uppercase tracking-wider px-4 py-2 rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" /> Send on WhatsApp
          </button>
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
        </>
      )}
      <button
        onClick={handlePrint}
        className="flex items-center gap-2 bg-gradient-to-r from-[var(--c-deep)] via-[var(--c-deep)] to-[var(--c-deep)] hover:brightness-105 text-white font-bold text-xs uppercase tracking-wider px-5 py-2 rounded-lg shadow-md transition-all cursor-pointer"
      >
        <Printer className="w-4 h-4" /> Download PDF / Print
      </button>
    </div>
  );
}
