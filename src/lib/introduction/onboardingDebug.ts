"use client";

import { useSyncExternalStore } from "react";

/**
 * Temporary, safe production debug mode for diagnosing the onboarding
 * "stuck on Cargando" incident. Entirely inert unless a page is loaded
 * with `?debug=1` in the URL — nobody sees this by accident, and no
 * behavior changes for real users. Records the exact state-transition
 * sequence between Firebase init and the onboarding content actually
 * rendering, visible both as a small on-page overlay (DebugOverlay.tsx)
 * and as console.log lines (searchable/copyable from DevTools, useful on
 * mobile Safari where the overlay may be all a person can screenshot).
 *
 * Deliberately logs only structural state (booleans, counts, route
 * strings, a truncated uid) — never profile field values, tokens, or
 * anything else that would be unsafe to have visible on-screen in
 * production. Remove this file and its call sites once the incident is
 * resolved and no longer needs live diagnosis.
 */

export interface DebugEvent {
  t: number;
  label: string;
  detail?: string;
}

let events: DebugEvent[] = [];
let startTime: number | null = null;
const listeners = new Set<() => void>();

export function isDebugMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
}

export function logDebugEvent(label: string, detail?: string): void {
  if (!isDebugMode()) return;
  if (startTime === null) startTime = Date.now();
  const event: DebugEvent = { t: Date.now() - startTime, label, detail };
  events = [...events, event];
  console.log(`[onboarding-debug] +${event.t}ms  ${label}${detail ? "  — " + detail : ""}`);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): DebugEvent[] {
  return events;
}

function getServerSnapshot(): DebugEvent[] {
  return [];
}

export function useDebugEvents(): DebugEvent[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Only for logging — never for anything security- or privacy-relevant. */
export function shortUid(uid: string): string {
  return uid.length > 8 ? `${uid.slice(0, 4)}…${uid.slice(-4)}` : uid;
}
