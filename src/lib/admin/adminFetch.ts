"use client";

import { auth } from "@/lib/firebase/client";

/**
 * Every /api/admin/dashboard/* call goes through this — it always attaches
 * a fresh Firebase ID token as a Bearer header, so each API call is
 * authorized independently (server-side, via requireAdminFromAuthHeader)
 * rather than relying on the page-load cookie. Throws if nobody is signed
 * in; callers are always rendered inside the authenticated AdminShell, so
 * that should only happen if the session was lost mid-use (e.g. signed out
 * in another tab) — callers should treat a thrown error here the same as
 * any other failed request.
 */
export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("not_signed_in");
  const token = await user.getIdToken();

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(path, { ...init, headers });
}

/** Convenience wrapper for the common case: JSON in, JSON out, throws with a readable message on ok:false. */
export async function adminFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await adminFetch(path, init);
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `request_failed_${res.status}`);
  }
  return data as T;
}

/** Refreshes the /admin page-load cookie from a freshly-forced ID token — see ADMIN_TOKEN_COOKIE. */
export async function refreshAdminSessionCookie(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  const idToken = await user.getIdToken(true);
  const res = await fetch("/api/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  return res.ok;
}
