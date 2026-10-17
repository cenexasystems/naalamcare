"use client";

import React from "react";
import {
  LayoutGrid,
  ShoppingCart,
  Truck,
  PackageSearch,
  Users,
  BarChart3,
  BellRing,
  Settings as SettingsIcon,
  Building2,
  Wallet,
  X,
} from "lucide-react";
import { MODE_LABEL, type Mode } from "@/lib/mode";

export type ScreenKey =
  | "dashboard"
  | "billing"
  | "purchase"
  | "inventory"
  | "customers"
  | "suppliers"
  | "payments"
  | "reports"
  | "expiry"
  | "settings";

/** The client's eight screens plus Suppliers and Invoices & Payments. Both
    dashboards share this list; labels can differ per mode. */
export const NAV_ITEMS: {
  key: ScreenKey;
  label: string;
  wholesaleLabel?: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}[] = [
  { key: "dashboard", label: "Dashboard", icon: <LayoutGrid className="h-[19px] w-[19px]" />, adminOnly: true },
  { key: "billing", label: "Billing (POS)", icon: <ShoppingCart className="h-[19px] w-[19px]" /> },
  { key: "purchase", label: "Purchase", icon: <Truck className="h-[19px] w-[19px]" />, adminOnly: true },
  { key: "inventory", label: "Inventory", icon: <PackageSearch className="h-[19px] w-[19px]" /> },
  { key: "customers", label: "Customers", wholesaleLabel: "Customers & Distributors", icon: <Users className="h-[19px] w-[19px]" /> },
  { key: "suppliers", label: "Suppliers", icon: <Building2 className="h-[19px] w-[19px]" />, adminOnly: true },
  { key: "payments", label: "Invoices & Payments", icon: <Wallet className="h-[19px] w-[19px]" /> },
  { key: "reports", label: "Reports", icon: <BarChart3 className="h-[19px] w-[19px]" /> },
  { key: "expiry", label: "Expiry Alert", icon: <BellRing className="h-[19px] w-[19px]" /> },
  { key: "settings", label: "Settings", icon: <SettingsIcon className="h-[19px] w-[19px]" />, adminOnly: true },
];

/* The bundled logo is what the app has always shown. Settings can point at a
   custom one, but only once "Use a custom logo" is switched on. */
export const DEFAULT_LOGO = "/logos/nalam-care-medicals-logo.png";

export const Sidebar = ({
  active,
  onSelect,
  role,
  mode = "retail",
  open,
  onClose,
  expiryCount,
  logo,
  useCustomLogo,
  shopName,
}: {
  active: ScreenKey;
  onSelect: (key: ScreenKey) => void;
  role: "admin" | "staff";
  /** Dashboard shown under the brand name */
  mode?: Mode;
  open: boolean;
  onClose: () => void;
  expiryCount: number;
  /** Logo path from shop settings; falls back to the bundled logo. */
  logo?: string;
  /** When false the stored `logo` is ignored and the bundled logo is shown. */
  useCustomLogo?: boolean;
  shopName?: string;
}) => {
  const items = NAV_ITEMS.filter((item) => role === "admin" || !item.adminOnly);
  const logoSrc = useCustomLogo ? logo || DEFAULT_LOGO : DEFAULT_LOGO;
  const brand = (shopName || "Nalam Care Medicals").toUpperCase();
  /* Keep the wordmark readable whatever the shop is called. */
  const brandWords = brand.split(/\s+/).filter(Boolean);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] shrink-0 flex-col bg-[#1a1d21] transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo card */}
        <div className="relative p-3">
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="absolute right-4 top-4 z-10 cursor-pointer rounded-md p-1 text-gray-500 hover:bg-gray-100 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              alt={brand}
              className="h-11 w-11 shrink-0 object-contain"
              onError={(e) => {
                /* A bad path in Settings shouldn't leave a broken image. */
                e.currentTarget.src = DEFAULT_LOGO;
              }}
            />
            <div className="min-w-0 leading-none">
              <p className="text-[15px] font-extrabold leading-[1.1] tracking-tight text-[var(--c-deep)]">
                {brandWords.length > 1 ? (
                  <>
                    {brandWords[0]}
                    <br />
                    {brandWords.slice(1).join(" ")}
                  </>
                ) : (
                  brand
                )}
              </p>
              <p className="mt-1 text-[7.5px] font-bold uppercase tracking-[0.12em] text-gray-500">
                {MODE_LABEL[mode]}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
          {items.map((item) => {
            const isActive = active === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onSelect(item.key)}
                className={`mb-0.5 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3.5 py-3 text-left text-[14px] font-medium transition ${
                  isActive
                    ? "bg-[var(--c-primary)] text-white shadow-sm"
                    : "text-white/80 hover:bg-white/[0.07] hover:text-white"
                }`}
              >
                <span className={isActive ? "text-white" : "text-white/70"}>{item.icon}</span>
                <span className="flex-1">{mode === "wholesale" ? item.wholesaleLabel || item.label : item.label}</span>
                {item.key === "expiry" && expiryCount > 0 && (
                  <span className="rounded-full bg-[#dc2626] px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {expiryCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="flex items-center gap-2.5 border-t border-white/10 px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt=""
            className="h-7 w-7 object-contain opacity-90"
            onError={(e) => {
              e.currentTarget.src = DEFAULT_LOGO;
            }}
          />
          <div className="leading-tight">
            <p className="text-[11.5px] font-semibold text-white/90">{brand}</p>
            <p className="text-[10.5px] text-white/45">{MODE_LABEL[mode]} · v1.1.0</p>
          </div>
        </div>
      </aside>
    </>
  );
};
