"use client";

/**
 * Set while this browser tab has seen a signed-in user, so that a guarded
 * page can tell "your session expired" apart from a first visit. Without
 * it, a new visitor opening /member was told "Tu sesión ha caducado".
 */
const HAD_SESSION_KEY = "junto_had_session";

export function rememberSignedIn(): void {
  try {
    window.sessionStorage.setItem(HAD_SESSION_KEY, "1");
  } catch {
    // Storage unavailable: the plain sign-in message is shown instead.
  }
}

export function forgetSignedIn(): void {
  try {
    window.sessionStorage.removeItem(HAD_SESSION_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Where a guarded page sends someone who is not signed in: back to the
 * sign-in page, returning to the same member page afterwards, with the
 * "session expired" note only when there really was a session.
 */
export function signInRedirectPath(pathname: string): string {
  let hadSession = false;
  try {
    hadSession = window.sessionStorage.getItem(HAD_SESSION_KEY) === "1";
  } catch {
    hadSession = false;
  }
  const params = new URLSearchParams();
  if (/^\/member(\/[a-z0-9/_-]*)?$/i.test(pathname) && !pathname.includes("//")) params.set("next", pathname);
  if (hadSession) params.set("session", "expired");
  const query = params.toString();
  return query ? `/introduction?${query}` : "/introduction";
}
