"use client";

import React, { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { expiryState } from "@/lib/format";
import { bindAudioUnlock } from "@/lib/alarm";
import { currentSession, logout as serverLogout } from "@/lib/actions";
import { isMode, type Mode, type SessionInfo } from "@/lib/mode";
import {
  useMedicines,
  useBatchRows,
  useBills,
  useCustomers,
  useSuppliers,
  useSettings,
  useLedger,
  mutateAll,
} from "@/components/pms/data";
import { ModeProvider, TOAST_EVENT } from "@/components/pms/mode-context";
import { Sidebar, type ScreenKey } from "@/components/pms/Sidebar";
import { TopBar } from "@/components/pms/TopBar";
import { Login } from "@/components/pms/Login";
import { Dashboard } from "@/components/pms/Dashboard";
import { Billing } from "@/components/pms/Billing";
import { WholesaleBilling } from "@/components/pms/WholesaleBilling";
import { Purchase } from "@/components/pms/Purchase";
import { Inventory } from "@/components/pms/Inventory";
import { Customers } from "@/components/pms/Customers";
import { Suppliers } from "@/components/pms/Suppliers";
import { Payments } from "@/components/pms/Payments";
import { Reports } from "@/components/pms/Reports";
import { ExpiryAlert } from "@/components/pms/ExpiryAlert";
import { SettingsPanel } from "@/components/pms/SettingsPanel";
import { Toast, ThemeApplier } from "@/components/pms/ui";

/* sessionStorage keys. The role key is also what the PWA install banner
   checks; the signed session itself lives in an httpOnly cookie. */
const SESSION_KEY = "nalam_care_medicals_session";
const MODE_KEY = "nalam_care_medicals_mode";

const readStoredMode = (): Mode | null => {
  try {
    const saved = window.sessionStorage.getItem(MODE_KEY);
    return isMode(saved) ? saved : null;
  } catch {
    return null;
  }
};

/** The billing mode to open: the last one used if still permitted, else the first permitted one. */
const startingMode = (info: SessionInfo): Mode => {
  const saved = readStoredMode();
  return saved && info.modes.includes(saved) ? saved : info.modes[0];
};

export default function PharmacyManagementSystem() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  /* Kept here so switching billing mode stays on the same screen. */
  const [screen, setScreen] = useState<ScreenKey>("billing");
  const [checking, setChecking] = useState(true);

  /* ------------------------------- session -------------------------------
     The signed cookie is the source of truth; the server tells us the role
     and which billing modes it opens. After login the app opens directly in
     the last-used (or first permitted) mode; the sidebar selector switches it. */
  useEffect(() => {
    let cancelled = false;
    currentSession()
      .then((info) => {
        if (cancelled) return;
        startTransition(() => {
          if (info) {
            setSession(info);
            setMode(startingMode(info));
          }
          setChecking(false);
        });
      })
      .catch(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const chooseMode = (next: Mode) => {
    setMode(next);
    try {
      window.sessionStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const login = (info: SessionInfo) => {
    setSession(info);
    try {
      window.sessionStorage.setItem(SESSION_KEY, info.role);
    } catch {
      /* ignore */
    }
    setScreen("billing");
    chooseMode(startingMode(info));
  };

  const logout = async () => {
    await serverLogout().catch(() => undefined);
    setSession(null);
    setMode(null);
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(MODE_KEY);
    } catch {
      /* ignore */
    }
  };

  /* The server refused this billing mode (access changed or session ended):
     re-read the session and move to a permitted mode, or back to login. */
  const recheckSession = async () => {
    const info = await currentSession().catch(() => null);
    if (!info) return logout();
    setSession(info);
    if (mode && !info.modes.includes(mode)) chooseMode(info.modes[0]);
  };

  if (checking) return <LoadingScreen />;
  if (!session || !mode) return <Login onSuccess={login} />;

  return (
    <ModeProvider value={{ mode, role: session.role, modes: session.modes }}>
      {/* Keyed by mode so each mode's screens start with that mode's data. */}
      <Workspace
        key={mode}
        mode={mode}
        session={session}
        screen={screen}
        onScreen={setScreen}
        onSwitchMode={chooseMode}
        onLogout={logout}
        onAccessDenied={recheckSession}
      />
    </ModeProvider>
  );
}

const LoadingScreen = () => (
  <div className="flex min-h-screen items-center justify-center bg-[#1a1d21]">
    <p className="animate-pulse text-[12px] font-bold uppercase tracking-[0.2em] text-white/60">Loading…</p>
  </div>
);

function Workspace({
  mode,
  session,
  screen,
  onScreen: setScreen,
  onSwitchMode,
  onLogout,
  onAccessDenied,
}: {
  mode: Mode;
  session: SessionInfo;
  screen: ScreenKey;
  onScreen: (screen: ScreenKey) => void;
  onSwitchMode: (mode: Mode) => void;
  onLogout: () => void;
  onAccessDenied: () => void;
}) {
  const role = session.role;
  const [expiryTab, setExpiryTab] = useState<"expired" | "soon" | "low">("soon");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [billingSearch, setBillingSearch] = useState("");
  const [toast, setToast] = useState<{ message: string; tone: "green" | "red" } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /* --------------------------------- data -------------------------------- */
  const { data: medicines = [], isLoading: medLoading, error: medError } = useMedicines();
  const denied = [401, 403].includes((medError as { status?: number } | undefined)?.status ?? 0);
  useEffect(() => {
    if (denied) onAccessDenied();
  }, [denied, onAccessDenied]);
  const { data: batchRows = [], isLoading: batchLoading } = useBatchRows();
  const { data: bills = [], isLoading: billsLoading } = useBills();
  const { data: customers = [], isLoading: custLoading } = useCustomers();
  const { data: suppliers = [], isLoading: suppLoading } = useSuppliers();
  const { data: settings = null, isLoading: setLoading } = useSettings();
  const { data: ledger } = useLedger();

  const isDataLoading = medLoading || batchLoading || billsLoading || custLoading || suppLoading || setLoading;

  /** Screens call this after a change purely to surface a toast. */
  const notify = (message?: string) => {
    mutateAll();
    if (message) setToast({ message, tone: "green" });
  };

  /* Errors from server actions arrive as a window event (see mode-context). */
  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; tone: "green" | "red" }>).detail;
      if (detail?.message) setToast(detail);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.tone === "red" ? 4200 : 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  /* --------- unlock audio on first tap so the stock alarm can ring on iOS -- */
  useEffect(() => bindAudioUnlock(), []);

  /* ------------------------------ F2 shortcut ---------------------------- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* --------------------------- expiry badge count ------------------------ */
  const expiryCount = useMemo(() => {
    let count = 0;
    for (const medicine of medicines) {
      for (const batch of medicine.batches) {
        const state = expiryState(batch.exp_date);
        if (state === "EXPIRED" || state === "SOON") count += 1;
      }
    }
    return count;
  }, [medicines]);

  const goToBillingWith = (query: string) => {
    setScreen("billing");
    setBillingSearch(query);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f7f8fa]">
      <ThemeApplier theme={settings?.colour_theme} />
      <Sidebar
        active={screen}
        onSelect={(key) => {
          setScreen(key);
          setSidebarOpen(false);
        }}
        role={role}
        mode={mode}
        modes={session.modes}
        onModeChange={(next) => {
          if (next === mode) return;
          onSwitchMode(next);
          setSidebarOpen(false);
        }}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        expiryCount={expiryCount}
        logo={settings?.logo || "/logos/nalam-care-medicals-logo.png"}
        useCustomLogo={Boolean(settings?.use_custom_logo)}
        shopName={settings?.shop_name || "Nalam Care Medicals"}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          search={search}
          onSearch={setSearch}
          onSearchSubmit={() => {
            if (!search.trim()) return;
            goToBillingWith(search.trim());
            setSearch("");
          }}
          onMenu={() => setSidebarOpen(true)}
          role={role}
          name={session.name}
          mode={mode}
          onLogout={onLogout}
          onRefresh={() => notify("Data refreshed.")}
          searchRef={searchRef}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-5">
          {isDataLoading ? (
            /* Shown inside the layout while this billing mode's data loads. */
            <p className="animate-pulse py-24 text-center text-[12px] font-bold uppercase tracking-[0.2em] text-gray-400">
              Loading…
            </p>
          ) : (
          <>
          {screen === "dashboard" && (
            <Dashboard
              medicines={medicines}
              bills={bills}
              customerCount={customers.length}
              onNavigate={setScreen}
            />
          )}

          {screen === "billing" && mode === "retail" && (
            <Billing
              medicines={medicines}
              query={billingSearch}
              onQueryChange={setBillingSearch}
              onDone={() => notify("Bill saved.")}
            />
          )}

          {screen === "billing" && mode === "wholesale" && (
            <WholesaleBilling
              medicines={medicines}
              customers={customers}
              bills={bills}
              query={billingSearch}
              onQueryChange={setBillingSearch}
              onDone={() => notify("Invoice saved.")}
            />
          )}

          {screen === "purchase" && role === "admin" && (
            <Purchase
              medicines={medicines}
              suppliers={suppliers}
              batchRows={batchRows}
              ledger={ledger}
              onSaved={notify}
            />
          )}

          {screen === "inventory" && (
            <Inventory
              medicines={medicines}
              rows={batchRows}
              onChanged={notify}
              onAddStock={() => setScreen("purchase")}
              onViewExpiry={(tab) => {
                setExpiryTab(tab);
                setScreen("expiry");
              }}
              role={role}
            />
          )}

          {screen === "customers" && (
            <Customers customers={customers} bills={bills} ledger={ledger} onChanged={notify} role={role} />
          )}

          {screen === "suppliers" && role === "admin" && (
            <Suppliers suppliers={suppliers} batchRows={batchRows} ledger={ledger} onChanged={notify} />
          )}

          {screen === "payments" && (
            <Payments bills={bills} customers={customers} ledger={ledger} onChanged={notify} role={role} />
          )}

          {screen === "reports" && (
            <Reports
              bills={bills}
              batchRows={batchRows}
              customers={customers}
              suppliers={suppliers}
              ledger={ledger}
              onChanged={notify}
              role={role}
            />
          )}

          {screen === "expiry" && <ExpiryAlert rows={batchRows} initialTab={expiryTab} />}

          {screen === "settings" && role === "admin" && (
            <SettingsPanel settings={settings} suppliers={suppliers} medicines={medicines} onChanged={notify} />
          )}
          </>
          )}
        </main>
      </div>

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  );
}
