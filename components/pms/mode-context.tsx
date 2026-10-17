"use client";

import React, { createContext, useContext } from "react";
import type { Mode, Role } from "@/lib/mode";
import type { ActionResult } from "@/lib/types";

/* The dashboard the user is working in (retail / wholesale) and their role.
   Screens read it from here so the existing component props stay as they were. */
type ModeState = { mode: Mode; role: Role; modes: Mode[] };

const ModeContext = createContext<ModeState | null>(null);

export const ModeProvider = ({ value, children }: { value: ModeState | null; children: React.ReactNode }) => (
  <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
);

/** Current dashboard; null before login / dashboard selection. */
export const useModeState = () => useContext(ModeContext);

export const useMode = (): Mode => useContext(ModeContext)?.mode ?? "retail";

/* -------------------------------------------------------------------------
   Server action results

   Server actions return { ok, data | error } instead of throwing (thrown
   messages are hidden in production builds). `act` shows the error as a red
   toast and hands the result back so the caller can stop.
   ------------------------------------------------------------------------- */

export const TOAST_EVENT = "ncm-toast";

export const toast = (message: string, tone: "green" | "red" = "green") => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, tone } }));
};

export async function act<T>(pending: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    const result = await pending;
    if (!result.ok) toast(result.error, "red");
    return result;
  } catch {
    const error = "Could not reach the server. Check the connection and try again.";
    toast(error, "red");
    return { ok: false, error };
  }
}
