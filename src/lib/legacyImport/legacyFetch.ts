"use client";

import { auth } from "@/lib/firebase/client";

/**
 * Same pattern as memberFetch.ts/adminFetch.ts: always attaches a fresh
 * Firebase ID token. Used only by the legacy-activation welcome page —
 * never carries or accepts an email parameter itself (see the API
 * routes' own doc comments for why that's the actual security boundary).
 */
export async function legacyFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("not_signed_in");
  const token = await user.getIdToken();

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    const error = new Error(data.error || `request_failed_${res.status}`);
    (error as Error & { code?: string }).code = data.error;
    throw error;
  }
  return data as T;
}
