"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Download, Smartphone, X } from "lucide-react";

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

/* Which device / browser this is, so the pop-up can say how to install where there's no Install button. */
type Platform = "ios" | "mac-safari" | "firefox-desktop" | "android" | "desktop";
const noSubscribe = () => () => {};
const readPlatform = (): Platform => {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch gives it away.
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Firefox/.test(ua)) return "firefox-desktop";
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua)) return "mac-safari";
  return "desktop";
};
const serverPlatform = (): Platform | null => null;

/** How to install when the browser has no one-tap install. */
const STEPS: Record<Platform, string> = {
  ios: "Tap the Share button, then “Add to Home Screen”.",
  "mac-safari": "In the menu bar choose File → “Add to Dock”.",
  "firefox-desktop": "Firefox can’t install apps — open this page in Chrome or Edge to install.",
  android: "Open the browser menu (⋮), then “Install app” or “Add to Home screen”.",
  desktop: "Open the browser menu (⋮), then “Install Nalam Care Medicals” (or the install icon in the address bar).",
};

const DISMISS_KEY = "ncm_install_dismissed";

/* The offline helper (service worker): register straight away if the page has already loaded —
   waiting for "load" after it has fired would mean it never registers. */
const registerServiceWorker = () => {
  if (!("serviceWorker" in navigator)) return;
  const register = () =>
    navigator.serviceWorker.register("/sw.js").catch((err) => console.error("PWA ServiceWorker registration failed:", err));
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
};

export default function PWAHandler() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [installAccepted, setInstallAccepted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  /** A moment after the login screen opens, so the browser's own install offer can arrive first */
  const [ready, setReady] = useState(false);
  const isStandalone = useSyncExternalStore(subscribeStandalone, readStandalone, serverStandalone);
  const isAuthorized = useSyncExternalStore(subscribeAuth, readAuth, serverAuth);
  const platform = useSyncExternalStore(noSubscribe, readPlatform, serverPlatform);
  const isInstalled = installAccepted || isStandalone;

  useEffect(() => {
    registerServiceWorker();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallAccepted(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    const timer = setTimeout(() => {
      try {
        setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
      } catch {
        /* storage blocked: just show it */
      }
      setReady(true);
    }, 1200);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstallAccepted(true);
    setDeferredPrompt(null);
  };

  const close = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  // Login screen only: not once signed in, not on customer invoice / return pages, not when already installed.
  const hidden =
    !ready ||
    dismissed ||
    isInstalled ||
    isAuthorized ||
    !platform ||
    pathname?.startsWith("/invoice") ||
    pathname?.startsWith("/return");
  if (hidden) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Nalam Care Medicals"
      className="fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-[340px] items-start gap-3 rounded-2xl border-2 border-[var(--c-primary)] bg-black p-3.5 text-white shadow-2xl print:hidden"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--c-primary)] bg-[var(--c-primary)]/20">
        <Smartphone className="h-5 w-5 text-[var(--c-primary)]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="pr-5 text-[12px] font-black uppercase tracking-tight">Install Nalam Care Medicals</p>
        {deferredPrompt ? (
          <>
            <p className="mt-0.5 text-[11px] font-semibold text-gray-300">Open it like an app, straight from your home screen.</p>
            <button
              onClick={handleInstallClick}
              className="mt-2 flex cursor-pointer items-center gap-1.5 rounded-xl bg-[var(--c-primary)] px-3.5 py-2 text-[11px] font-black uppercase tracking-wider text-white shadow-sm transition hover:bg-[var(--c-deep)]"
            >
              <Download className="h-3.5 w-3.5" />
              Install
            </button>
          </>
        ) : (
          <p className="mt-0.5 text-[11.5px] font-semibold leading-snug text-gray-300">{STEPS[platform]}</p>
        )}
      </div>
      <button
        onClick={close}
        aria-label="Close install message"
        className="absolute right-2 top-2 cursor-pointer rounded-md p-1 text-gray-400 transition hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
