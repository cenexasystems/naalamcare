"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--c-deep)] px-5 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-all hover:brightness-105"
    >
      <Printer className="h-4 w-4" /> Print return bill
    </button>
  );
}
