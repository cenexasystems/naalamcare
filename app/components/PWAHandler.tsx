"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Download, Smartphone } from "lucide-react";

/** The slice of `BeforeInstallPromptEvent` this component actually uses. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/* Auth lives in browser storage, which is outside React — subscribe to it
   instead of copying it into state from an effect. */
const AUTH_KEYS = ["pos_authorized", "nalam_care_medicals_session"];
const subscribeAuth = (onChange: () => void) => {
  const timer = setInterval(onChange, 1000);
  window.addEventListener("storage", onChange);
  return () => {
    clearInterval(timer);
    window.removeEventListener("storage", onChange);
  };
};
const readAuth = (): boolean => {
  try {
    return AUTH_KEYS.some(
      (key) => sessionStorage.getItem(key) !== null || localStorage.getItem(key) !== null,
    );
  } catch {
    return false;
  }
};
const serverAuth = () => false;

/* Standalone/PWA display mode is another external source of truth. */
const STANDALONE_QUERY = "(display-mode: standalone)";
const subscribeStandalone = (onChange: () => void) => {
  const mql = window.matchMedia(STANDALONE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
};
const readStandalone = (): boolean => {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia(STANDALONE_QUERY).matches || nav.standalone === true;
};
const serverStandalone = () => false;

export default function PWAHandler() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [installAccepted, setInstallAccepted] = useState(false);
  const isStandalone = useSyncExternalStore(
    subscribeStandalone,
    readStandalone,
    serverStandalone,
  );
  const isInstalled = installAccepted || isStandalone;
  const isAuthorized = useSyncExternalStore(subscribeAuth, readAuth, serverAuth);

  useEffect(() => {
    // Service worker registration
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("PWA ServiceWorker registered with scope:", reg.scope);
          })
          .catch((err) => {
            console.error("PWA ServiceWorker registration failed:", err);
          });
      });
    }

    // Listen for PWA installation prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as InstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    window.addEventListener("appinstalled", () => {
      setInstallAccepted(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setInstallAccepted(true);
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  // Hide on invoice pages, if already installed/not installable, or if user is authorized (in dashboard)
  if (isInstalled || !isInstallable || pathname?.startsWith("/invoice") || isAuthorized) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:bottom-4 z-50 bg-[#000000] text-white p-2.5 sm:p-4 rounded-2xl shadow-2xl border-2 border-[var(--c-primary)] flex items-center gap-2.5 sm:gap-3 animate-in slide-in-from-bottom-5 duration-300 w-auto sm:max-w-[360px] print:hidden">
      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[var(--c-primary)]/20 border border-[var(--c-primary)] flex items-center justify-center shrink-0">
        <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--c-primary)]" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-[11px] sm:text-xs font-black tracking-tight text-white uppercase truncate">
          Install Nalam Care Medicals
        </h4>
        <p className="text-[9px] sm:text-[10px] text-gray-300 font-semibold truncate">
          Add app for fast offline access
        </p>
      </div>
      <button
        onClick={handleInstallClick}
        className="bg-[var(--c-primary)] hover:bg-[var(--c-deep)] text-white text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl transition-all cursor-pointer shadow-sm flex items-center gap-1 shrink-0"
      >
        <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        Install
      </button>
    </div>
  );
}
