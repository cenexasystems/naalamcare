"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Search, CalendarDays, User, ChevronDown, Menu, LogOut, RotateCw, ArrowLeftRight } from "lucide-react";
import { dateLong, timeLabel } from "@/lib/format";
import { MODE_LABEL, type Mode } from "@/lib/mode";

/* A ticking clock is an external source of truth, so it is subscribed to
   rather than pushed into state from an effect. The snapshot is bucketed to
   30s so it stays stable between ticks. */
const TICK_MS = 30_000;
const subscribeClock = (onChange: () => void) => {
  const timer = setInterval(onChange, TICK_MS);
  return () => clearInterval(timer);
};
const clockSnapshot = () => Math.floor(Date.now() / TICK_MS);
const clockServerSnapshot = () => null;

export const TopBar = ({
  search,
  onSearch,
  onSearchSubmit,
  onMenu,
  role,
  name,
  mode = "retail",
  onSwitchMode,
  onLogout,
  onRefresh,
  searchRef,
}: {
  search: string;
  onSearch: (value: string) => void;
  onSearchSubmit: () => void;
  onMenu: () => void;
  role: "admin" | "staff";
  /** Signed-in user's name (user accounts); falls back to "Pharmacist". */
  name?: string;
  mode?: Mode;
  /** Present only when the user may open the other dashboard. */
  onSwitchMode?: () => void;
  onLogout: () => void;
  onRefresh: () => void;
  searchRef?: React.RefObject<HTMLInputElement | null>;
}) => {
  const tick = useSyncExternalStore(subscribeClock, clockSnapshot, clockServerSnapshot);
  const now = tick === null ? null : new Date(tick * TICK_MS);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickAway = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-1.5 border-b border-[#e9ecef] bg-white px-2 sm:gap-3 sm:px-5">
      <button
        onClick={onMenu}
        aria-label="Open menu"
        className="shrink-0 cursor-pointer rounded-lg p-2 text-gray-600 transition hover:bg-gray-100 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Global medicine search */}
      <div className="mx-auto min-w-0 flex-1 max-w-[560px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearchSubmit();
            }}
            placeholder="Search medicine by name"
            className="h-11 w-full rounded-xl border border-[#e2e6ea] bg-white pl-9 pr-3 text-[14px] sm:pl-11 sm:pr-14 text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-[var(--c-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--c-primary)_12%,transparent)]"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md sm:inline-block border border-[var(--c-mint)] bg-[var(--c-mint)] px-2 py-0.5 text-[11px] font-semibold text-[var(--c-deep)]">
            F2
          </span>
        </div>
      </div>

      {/* Date / time */}
      <div className="hidden items-center gap-2.5 rounded-xl border border-[#e9ecef] px-3.5 py-2 md:flex">
        <CalendarDays className="h-[18px] w-[18px] text-gray-500" />
        <div className="leading-tight">
          <p className="whitespace-nowrap text-[12.5px] font-semibold text-gray-800">
            {now ? dateLong(now.toISOString()) : "—"}
          </p>
          <p className="text-[11.5px] text-gray-500">{now ? timeLabel(now.toISOString()) : ""}</p>
        </div>
      </div>

      {/* User */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex shrink-0 cursor-pointer items-center gap-2.5 rounded-xl p-1 sm:px-2.5 sm:py-2 transition hover:bg-gray-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
            <User className="h-[18px] w-[18px] text-gray-600" />
          </span>
          <span className="hidden leading-tight sm:block">
            <span className="block text-[13px] font-semibold text-gray-800">{name || "Pharmacist"}</span>
            <span className="block text-[11.5px] capitalize text-gray-500">
              {role} · {mode}
            </span>
          </span>
          <ChevronDown className="hidden h-4 w-4 text-gray-400 sm:block" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-30 mt-2 w-60 overflow-hidden rounded-xl border border-[#e9ecef] bg-white py-1 shadow-lg">
            <button
              onClick={() => {
                setMenuOpen(false);
                onRefresh();
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-gray-700 transition hover:bg-gray-50"
            >
              <RotateCw className="h-4 w-4 text-gray-500" /> Refresh data
            </button>
            {onSwitchMode && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onSwitchMode();
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-gray-700 transition hover:bg-gray-50"
              >
                <ArrowLeftRight className="h-4 w-4 text-gray-500" /> Switch to{" "}
                {MODE_LABEL[mode === "retail" ? "wholesale" : "retail"]}
              </button>
            )}
            <button
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-red-600 transition hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
