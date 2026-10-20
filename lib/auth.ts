import "server-only";
import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { MODES, isMode, type Mode, type Role, type SessionInfo } from "./mode";

/* ==========================================================================
   One login system, two roles.

   Everyone signs in on the same login page with a passcode. A passcode
   belongs to one of:
     • the built-in admin passcode (ADMIN_PASSCODE, or the one set in
       Settings → Login passcodes, which then replaces it);
     • a user account created by the admin in Settings → Users (role admin
       or staff, with Retail / Wholesale / both dashboard access);
     • the optional shared staff passcode (STAFF_PASSCODE, or its Settings
       replacement); its dashboards come from STAFF_MODES.
   Retail and wholesale are dashboards a user may open — never roles.

   The result is kept in a signed, httpOnly cookie. For user accounts the
   server re-reads the account on every request, so a changed role,
   revoked dashboard or deactivated account takes effect immediately.
   ========================================================================== */

const COOKIE = "ncm_session";
const MAX_AGE = 60 * 60 * 12; // one working day

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

const passcodes = () => ({
  admin: process.env.ADMIN_PASSCODE || process.env.NEXT_PUBLIC_ADMIN_PASSCODE || "admin123",
  staff: process.env.STAFF_PASSCODE || process.env.NEXT_PUBLIC_STAFF_PASSCODE || "staff123",
});

const secret = (): string =>
  process.env.SESSION_SECRET ||
  // Fallback keeps existing deployments working without a new variable, while
  // still never shipping the signing key to the browser.
  createHash("sha256")
    .update(`nalam-care-medicals|${process.env.DATABASE_URL ?? ""}|${passcodes().admin}`)
    .digest("hex");

/** Dashboards the shared staff passcode may open. Defaults to both. */
const staffModes = (): Mode[] => {
  const modes = (process.env.STAFF_MODES || "retail,wholesale").split(",").map((m) => m.trim()).filter(isMode);
  return modes.length ? modes : [...MODES];
};

export const normalisePasscode = (passcode: string) => String(passcode ?? "").replace(/\s/g, "");

/** Deterministic so the login can look an account up by passcode alone; scrypt keeps it slow to brute-force. */
export const hashPasscode = (passcode: string) =>
  scryptSync(normalisePasscode(passcode), "nalam-care-medicals/app-users", 32).toString("hex");

/** Hashes of built-in passcodes reset from Settings; a set one replaces the environment value. */
const savedPasscodeHashes = async (): Promise<{ admin: string; staff: string }> => {
  try {
    const rows = await db.select().from(schema.loginPasscodes);
    const of = (role: Role) => rows.find((r) => r.role === role)?.passcodeHash || "";
    return { admin: of("admin"), staff: of("staff") };
  } catch (err) {
    // Before database.sql has created login_passcodes, the environment passcodes apply.
    if (!/login_passcodes/.test(String((err as { cause?: unknown })?.cause ?? err))) throw err;
    return { admin: "", staff: "" };
  }
};

/** Does `passcode` open the built-in admin / staff login (saved reset first, else the environment)? */
const matchesBuiltIn = async (passcode: string): Promise<Role | null> => {
  const p = normalisePasscode(passcode);
  if (!p) return null;
  const saved = await savedPasscodeHashes();
  const codes = passcodes();
  const hash = hashPasscode(p);
  if (saved.admin ? hash === saved.admin : p === codes.admin) return "admin";
  if (saved.staff ? hash === saved.staff : p === codes.staff) return "staff";
  return null;
};

/** Passcodes of the built-in logins; user accounts can't reuse them. */
export const isReservedPasscode = async (passcode: string) => (await matchesBuiltIn(passcode)) !== null;

/** Settings → Login passcodes: set a new built-in admin / staff passcode, or null to go back to the server value. */
export const setBuiltInPasscode = async (role: Role, passcode: string | null) => {
  if (passcode === null) {
    await db.delete(schema.loginPasscodes).where(eq(schema.loginPasscodes.role, role));
    return;
  }
  const passcodeHash = hashPasscode(passcode);
  await db
    .insert(schema.loginPasscodes)
    .values({ role, passcodeHash })
    .onConflictDoUpdate({ target: schema.loginPasscodes.role, set: { passcodeHash, updatedAt: new Date() } });
};

/** Which built-in passcodes have been reset from Settings (never the passcodes themselves). */
export const builtInPasscodeStatus = async () => {
  const saved = await savedPasscodeHashes();
  return { admin: Boolean(saved.admin), staff: Boolean(saved.staff) };
};

export const parseModes = (raw: string): Mode[] => {
  const modes = raw.split(",").map((m) => m.trim()).filter(isMode);
  return MODES.filter((m) => modes.includes(m));
};

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** Token for a customer-facing invoice link (e.g. sent on WhatsApp): opens that one bill, read-only, without a login. */
export const billShareToken = (billId: string): string => sign(`bill-share|${billId}`).slice(0, 24);

export const isValidBillShareToken = (billId: string, token: unknown): boolean => {
  if (typeof token !== "string" || !token) return false;
  const expected = Buffer.from(billShareToken(billId));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

const encode = (session: SessionInfo): string => {
  const payload = Buffer.from(
    JSON.stringify({ ...session, exp: Math.floor(Date.now() / 1000) + MAX_AGE }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
};

const decode = (token: string | undefined): (SessionInfo & { userId?: string }) | null => {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;
    if (data.role !== "admin" && data.role !== "staff") return null;
    const modes = Array.isArray(data.modes) ? data.modes.filter(isMode) : [];
    return {
      role: data.role as Role,
      modes,
      name: typeof data.name === "string" ? data.name : "",
      userId: typeof data.userId === "string" ? data.userId : undefined,
    };
  } catch {
    return null;
  }
};

/** Turn a stored account into session info; null when it can't sign in. */
const accountSession = (user: typeof schema.appUsers.$inferSelect): SessionInfo | null => {
  if (!user.active) return null;
  const role: Role = user.role === "admin" ? "admin" : "staff";
  const modes = role === "admin" ? [...MODES] : parseModes(user.modes);
  if (!modes.length) return null;
  return { role, modes, name: user.name, userId: user.id };
};

/** Resolve a passcode to a role and the dashboards it opens. */
export const resolvePasscode = async (passcode: string): Promise<SessionInfo | null> => {
  const entered = normalisePasscode(passcode);
  if (!entered) return null;
  const builtIn = await matchesBuiltIn(entered);
  if (builtIn === "admin") return { role: "admin", modes: [...MODES], name: "" };

  try {
    const rows = await db.select().from(schema.appUsers).where(eq(schema.appUsers.passcodeHash, hashPasscode(entered))).limit(1);
    if (rows.length) return accountSession(rows[0]);
  } catch (err) {
    // Before database.sql has created app_users there are no accounts yet; the
    // environment passcodes must keep working.
    if (!/app_users/.test(String((err as { cause?: unknown })?.cause ?? err))) throw err;
  }

  if (builtIn === "staff") return { role: "staff", modes: staffModes(), name: "" };
  return null;
};

export const writeSession = async (session: SessionInfo) => {
  const store = await cookies();
  store.set(COOKIE, encode(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
};

export const clearSession = async () => {
  const store = await cookies();
  store.delete(COOKIE);
};

export const getSession = async (): Promise<SessionInfo | null> => {
  const store = await cookies();
  const session = decode(store.get(COOKIE)?.value);
  if (!session) return null;
  if (session.userId) {
    // Accounts are re-read every time: role / dashboard / active changes apply at once.
    const rows = await db.select().from(schema.appUsers).where(eq(schema.appUsers.id, session.userId)).limit(1);
    return rows.length ? accountSession(rows[0]) : null;
  }
  return session.modes.length ? session : null;
};

export const requireSession = async (): Promise<SessionInfo> => {
  const session = await getSession();
  if (!session) throw new AuthError("Your session has expired. Please log in again.", 401);
  return session;
};

export const requireAdmin = async (): Promise<SessionInfo> => {
  const session = await requireSession();
  if (session.role !== "admin") throw new AuthError("Only an admin can do that.");
  return session;
};

/** Throws unless the caller is signed in and allowed into `mode`. */
export const requireMode = async (mode: unknown, opts: { admin?: boolean } = {}): Promise<Mode> => {
  if (!isMode(mode)) throw new AuthError("Unknown dashboard.", 400);
  const session = opts.admin ? await requireAdmin() : await requireSession();
  if (!session.modes.includes(mode)) {
    throw new AuthError(`You do not have access to the ${mode} dashboard.`);
  }
  return mode;
};

/** Route-handler guard: reads `?mode=` and answers 400/401/403 instead of throwing. */
export const guardRoute = async (
  request: Request,
): Promise<{ mode: Mode; session: SessionInfo } | NextResponse> => {
  const mode = new URL(request.url).searchParams.get("mode");
  try {
    if (!isMode(mode)) throw new AuthError("Unknown dashboard.", 400);
    const session = await requireSession();
    if (!session.modes.includes(mode)) throw new AuthError(`You do not have access to the ${mode} dashboard.`);
    return { mode, session };
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 403;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
};
