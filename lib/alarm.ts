/**
 * Alarm sound (Web Audio) with an iOS-safe unlock.
 *
 * iOS Safari starts every AudioContext "suspended" and will only let it start
 * playing when resume() runs *inside* a real user gesture (a tap/click/keypress).
 * A resume() called later from a React effect or a setInterval is ignored, so the
 * beep would be silent on iPhone. To get around that we unlock a single shared
 * context on the very first user interaction anywhere in the app (e.g. the Login
 * tap), then reuse it for the alarm later.
 */

let ctx: AudioContext | null = null;
let unlockBound = false;

const getCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  return ctx;
};

/** Resume + play a 1-sample silent buffer — the iOS gesture handshake. */
const unlock = () => {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  try {
    const buffer = c.createBuffer(1, 1, 22050);
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(c.destination);
    source.start(0);
  } catch {
    /* ignore */
  }
};

/**
 * Register once (on app mount) so the first tap/click/keypress unlocks audio.
 * Returns a cleanup function.
 */
export const bindAudioUnlock = (): (() => void) => {
  if (typeof window === "undefined" || unlockBound) return () => {};
  unlockBound = true;
  const handler = () => unlock();
  // `once` per event; a tap fires pointerdown, a keyboard user fires keydown.
  window.addEventListener("pointerdown", handler, { once: true });
  window.addEventListener("touchend", handler, { once: true });
  window.addEventListener("keydown", handler, { once: true });
  return () => {
    window.removeEventListener("pointerdown", handler);
    window.removeEventListener("touchend", handler);
    window.removeEventListener("keydown", handler);
    unlockBound = false;
  };
};

/** One "ring": a two-tone alert chirp. Safe to call on an interval. */
export const playAlarmBeep = () => {
  const c = getCtx();
  if (!c) return;
  // Best-effort resume in case the context lapsed back to suspended.
  if (c.state === "suspended") c.resume().catch(() => {});
  const now = c.currentTime;
  [0, 0.18].forEach((offset, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "square";
    osc.frequency.value = i === 0 ? 880 : 660;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);
    osc.connect(gain).connect(c.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.15);
  });
};
