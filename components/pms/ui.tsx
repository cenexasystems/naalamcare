"use client";

import React from "react";
import { X } from "lucide-react";
import { themeTokens } from "@/lib/format";

/* ------------------------------- Section ------------------------------- */

export const PageTitle = ({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-[22px] font-bold tracking-tight text-gray-900">{title}</h1>
      {subtitle && <p className="mt-0.5 text-[13px] text-gray-500">{subtitle}</p>}
    </div>
    {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
  </div>
);

/** Green screen heading used on the Billing and Purchase screens */
export const ScreenHeading = ({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="mb-4 flex items-center gap-2.5">
    {icon}
    <h2 className="text-[15px] font-bold uppercase tracking-wide text-[var(--c-deep)]">{children}</h2>
  </div>
);

export const Card = ({
  className = "",
  children,
  onClick,
}: {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) => (
  <div onClick={onClick} className={`rounded-xl border border-[#e5e7eb] bg-white ${className}`}>{children}</div>
);

/* --------------------------------------------------------------------------
   Theme applier

   The shell's Tailwind classes reference the --c-* custom properties rather
   than literal hex, so writing those properties on <html> restyles every
   screen at once. Runs on mount and again whenever the stored theme changes.
   -------------------------------------------------------------------------- */
export const ThemeApplier = ({ theme }: { theme?: string | null }) => {
  React.useEffect(() => {
    const tokens = themeTokens(theme);
    const root = document.documentElement;
    root.style.setProperty("--c-primary", tokens.primary);
    root.style.setProperty("--c-deep", tokens.deep);
    root.style.setProperty("--c-hover", tokens.hover);
    root.style.setProperty("--c-mint", tokens.mint);
  }, [theme]);

  return null;
};

/* -------------------------------- Fields -------------------------------- */

export const Field = ({
  label,
  children,
  hint,
  className = "",
}: {
  label?: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) => (
  <div className={className}>
    {label && <label className="field-label">{label}</label>}
    {children}
    {hint && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}
  </div>
);

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className = "", ...props }, ref) {
    return <input ref={ref} {...props} className={`field ${className}`} />;
  },
);

export const Select = ({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={`field appearance-none bg-no-repeat pr-9 ${className}`}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
      backgroundPosition: "right 10px center",
      ...props.style,
    }}
  >
    {children}
  </select>
);

/* ------------------------------- Buttons -------------------------------- */

export const Button = ({
  variant = "primary",
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "blue";
}) => {
  const styles: Record<string, string> = {
    primary: "bg-[var(--c-deep)] text-white hover:bg-[var(--c-hover)]",
    ghost: "border border-[#d8dde3] bg-white text-gray-700 hover:bg-gray-50",
    danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50",
    blue: "bg-[#1f6feb] text-white hover:bg-[#1a5fd0]",
  };
  return (
    <button
      {...props}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

/* -------------------------------- Badges -------------------------------- */

export const ScheduleBadge = ({ schedule }: { schedule: string }) => {
  const otc = schedule === "OTC";
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold ${
        otc ? "text-[#00897b]" : "text-[#dc2626]"
      }`}
    >
      {otc ? "OTC" : `SCHEDULED - ${schedule}`}
    </span>
  );
};

export const Pill = ({
  tone = "gray",
  children,
}: {
  tone?: "gray" | "green" | "red" | "amber" | "blue";
  children: React.ReactNode;
}) => {
  const tones: Record<string, string> = {
    gray: "bg-gray-100 text-gray-700",
    green: "bg-[var(--c-mint)] text-[var(--c-deep)]",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
};

/* -------------------------------- Modal --------------------------------- */

export const Modal = ({
  open,
  onClose,
  title,
  subtitle,
  width = "max-w-3xl",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-[2px] sm:p-8">
      <div className={`w-full ${width} overflow-hidden rounded-2xl bg-white shadow-2xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-[#eceff2] px-6 py-5">
          <div>
            <h3 className="text-[19px] font-bold text-gray-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[13px] text-gray-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#eceff2] px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/* ------------------------------ Stat tiles ------------------------------ */

/** Small centered popup showing a single stat value. */
export const ValuePopup = ({
  open,
  onClose,
  icon,
  iconClass,
  label,
  value,
  sub,
}: {
  open: boolean;
  onClose: () => void;
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) =>
  !open ? null : (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xs rounded-2xl bg-white px-6 py-6 text-center shadow-2xl"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 cursor-pointer rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100"
        >
          <X className="h-4 w-4" />
        </button>
        <span className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${iconClass}`}>{icon}</span>
        <p className="text-[13px] text-gray-500">{label}</p>
        <p className="mt-1 break-words text-[30px] font-bold leading-tight text-gray-900">{value}</p>
        {sub && <p className="mt-1 text-[12.5px] text-gray-500">{sub}</p>}
      </div>
    </div>
  );

export const StatTile = ({
  icon,
  label,
  value,
  tone = "blue",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: "blue" | "amber" | "red" | "green" | "gray";
}) => {
  const [open, setOpen] = React.useState(false);
  const tones: Record<string, string> = {
    blue: "text-[#1f6feb] bg-[#eaf1fe]",
    amber: "text-[#d97706] bg-[#fef4e6]",
    red: "text-[#dc2626] bg-[#fdecec]",
    green: "text-[var(--c-deep)] bg-[var(--c-mint)]",
    gray: "text-gray-600 bg-gray-100",
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center gap-3.5 rounded-xl border border-[#e5e7eb] bg-white px-4 py-4 text-left transition hover:border-[color-mix(in_srgb,var(--c-primary)_40%,transparent)] hover:shadow-md"
      >
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug text-gray-500">{label}</p>
          <p className="break-words text-[22px] font-bold leading-tight text-gray-900">{value}</p>
        </div>
      </button>
      <ValuePopup open={open} onClose={() => setOpen(false)} icon={icon} iconClass={tones[tone]} label={label} value={value} />
    </>
  );
};

export const EmptyState = ({
  icon,
  title,
  hint,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
}) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
    {icon && <div className="text-gray-300">{icon}</div>}
    <p className="text-sm font-semibold text-gray-700">{title}</p>
    {hint && <p className="max-w-sm text-[13px] text-gray-500">{hint}</p>}
  </div>
);

/* ------------------------------- Toaster -------------------------------- */

export const Toast = ({ message, tone = "green" }: { message: string; tone?: "green" | "red" }) => (
  <div
    className={`fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-xl ${
      tone === "green" ? "bg-[var(--c-deep)]" : "bg-red-600"
    }`}
  >
    {message}
  </div>
);
