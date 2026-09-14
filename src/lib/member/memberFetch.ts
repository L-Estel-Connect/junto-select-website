"use client";

import { auth } from "@/lib/firebase/client";

/**
 * Every /api/member/* lifecycle call goes through this — always attaches a
 * fresh Firebase ID token as a Bearer header, mirroring adminFetch.ts's
 * exact pattern for the admin dashboard. Throws if nobody is signed in;
 * every caller here is always rendered inside MemberShell's auth guard, so
 * that should only happen if the session was lost mid-use.
 */
export async function memberFetch(path: string, init: RequestInit = {}): Promise<Response> {
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
export async function memberFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await memberFetch(path, init);
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `request_failed_${res.status}`);
  }
  return data as T;
}
