"use client";

import React, { useState } from "react";
import { Lock, Eye, EyeOff, ShieldCheck, ShoppingCart, Truck, LogOut, ChevronRight } from "lucide-react";
import { login } from "@/lib/actions";
import { APP_NAME, MODE_LABEL, type Mode, type SessionInfo } from "@/lib/mode";

const LOGO = "/logos/nalam-care-medicals-logo.png";

/** Brand card shared by the login screen and the dashboard picker. */
const BrandCard = () => (
  <div className="mb-6 flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-5">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={LOGO} alt={APP_NAME} className="h-16 w-16 object-contain" />
    <div className="text-center">
      <p className="text-[19px] font-extrabold uppercase leading-tight tracking-tight text-[var(--c-deep)]">
        {APP_NAME}
      </p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-gray-500">
        Pharmacy Management System
      </p>
    </div>
  </div>
);

export const Login = ({
  onSuccess,
}: {
  onSuccess: (session: SessionInfo) => void;
}) => {
  const [passcode, setPasscode] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /* The passcode is checked on the server, which then sets a signed session
     cookie that every API call and server action verifies. */
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const result = await login(passcode);
      if (result.ok) return onSuccess(result.data);
      setError(result.error);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1a1d21] px-4">
      <div className="w-full max-w-[400px]">
        <BrandCard />

        <form onSubmit={submit} className="rounded-2xl bg-white p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--c-mint)]">
              <ShieldCheck className="h-[18px] w-[18px] text-[var(--c-deep)]" />
            </span>
            <div>
              <p className="text-[15px] font-bold text-gray-900">Secure Login</p>
              <p className="text-[12px] text-gray-500">Enter your passcode to continue</p>
            </div>
          </div>

          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              type={show ? "text" : "password"}
              value={passcode}
              onChange={(e) => {
                setPasscode(e.target.value);
                setError("");
              }}
              placeholder="Passcode"
              className="h-12 w-full rounded-lg border border-[#d8dde3] bg-white pl-10 pr-11 text-[15px] outline-none transition placeholder:text-gray-400 focus:border-[var(--c-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--c-primary)_15%,transparent)]"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide passcode" : "Show passcode"}
              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 transition hover:text-gray-700"
            >
              {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </button>
          </div>

          {error && <p className="mt-2.5 text-[12.5px] font-medium text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full cursor-pointer rounded-lg bg-[var(--c-deep)] py-3 text-[14px] font-bold text-white transition hover:bg-[var(--c-hover)] disabled:cursor-wait disabled:opacity-70"
          >
            {busy ? "Checking…" : "Login"}
          </button>

          <p className="mt-4 text-center text-[11.5px] leading-relaxed text-gray-400">
            Admin has full access. Staff can bill, view inventory, customers and expiry alerts.
          </p>
        </form>

        <p className="mt-5 text-center text-[11px] font-medium uppercase tracking-[0.15em] text-white/40">
          Powered by Cenexa Systems
        </p>
      </div>
    </div>
  );
};

/** Shown after login when the user may open both dashboards. */
export const DashboardPicker = ({
  modes,
  onPick,
  onLogout,
}: {
  modes: Mode[];
  onPick: (mode: Mode) => void;
  onLogout: () => void;
}) => {
  const options: { mode: Mode; icon: React.ReactNode; hint: string }[] = [
    {
      mode: "retail",
      icon: <ShoppingCart className="h-[18px] w-[18px] text-[var(--c-deep)]" />,
      hint: "Counter sales, walk-in customers, retail stock",
    },
    {
      mode: "wholesale",
      icon: <Truck className="h-[18px] w-[18px] text-[var(--c-deep)]" />,
      hint: "Bulk orders, business buyers, credit terms, wholesale stock",
    },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1a1d21] px-4">
      <div className="w-full max-w-[400px]">
        <BrandCard />

        <div className="rounded-2xl bg-white p-6">
          <p className="text-[15px] font-bold text-gray-900">Choose a dashboard</p>
          <p className="mb-4 text-[12px] text-gray-500">
            Both share one medicine catalogue; stock, bills and customers stay separate.
          </p>
          <div className="space-y-2.5">
            {options
              .filter((o) => modes.includes(o.mode))
              .map((o) => (
                <button
                  key={o.mode}
                  onClick={() => onPick(o.mode)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-[#e5e7eb] px-4 py-3.5 text-left transition hover:border-[var(--c-primary)] hover:bg-[var(--c-mint)]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--c-mint)]">
                    {o.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-gray-900">{MODE_LABEL[o.mode]}</span>
                    <span className="block text-[11.5px] text-gray-500">{o.hint}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                </button>
              ))}
          </div>
          <button
            onClick={onLogout}
            className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg py-2 text-[12.5px] font-semibold text-red-600 transition hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      </div>
    </div>
  );
};
