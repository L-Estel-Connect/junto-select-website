"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  completeMagicLinkSignIn,
  getStoredEmailForSignIn,
  isMagicLinkUrl,
  watchAuthState,
} from "./auth";
import { auth } from "./client";
import { logDebugEvent, shortUid } from "@/lib/introduction/onboardingDebug";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsEmailForLink, setNeedsEmailForLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribed = false;
    // `loading` must stay true until BOTH of these are true, so the
    // unauthenticated sign-in screen never flashes while a magic link is
    // still being verified in the background (onAuthStateChanged tends to
    // fire with `null` almost immediately, well before the async
    // completeMagicLinkSignIn call below has resolved).
    let authStateKnown = false;
    let magicLinkSettled = true;

    function maybeStopLoading() {
      if (!unsubscribed && authStateKnown && magicLinkSettled) {
        logDebugEvent("AUTH_LOADING_FALSE");
        setLoading(false);
      }
    }

    async function init() {
      if (
        typeof window !== "undefined" &&
        !auth.currentUser &&
        isMagicLinkUrl(window.location.href)
      ) {
        const storedEmail = getStoredEmailForSignIn();
        if (storedEmail) {
          magicLinkSettled = false;
          try {
            await completeMagicLinkSignIn(storedEmail, window.location.href);
            window.history.replaceState({}, "", window.location.pathname);
          } catch (error) {
            console.error("Magic link sign-in failed", error);
            if (!unsubscribed) {
              setLinkError(
                "Este enlace ya no es válido. Solicita uno nuevo.",
              );
            }
          } finally {
            magicLinkSettled = true;
            maybeStopLoading();
          }
        } else if (!unsubscribed) {
          setNeedsEmailForLink(true);
        }
      }
    }

    init();

    const unsubscribe = watchAuthState((nextUser) => {
      if (unsubscribed) return;
      logDebugEvent(
        "AUTH_RESOLVED",
        nextUser ? `uid=${shortUid(nextUser.uid)}` : "no user",
      );
      if (nextUser) logDebugEvent("UID_PRESENT", shortUid(nextUser.uid));
      setUser(nextUser);
      authStateKnown = true;
      maybeStopLoading();
    });

    return () => {
      unsubscribed = true;
      unsubscribe();
    };
  }, []);

  const confirmEmailForLink = useCallback(async (email: string) => {
    setLinkError(null);
    try {
      await completeMagicLinkSignIn(email, window.location.href);
      window.history.replaceState({}, "", window.location.pathname);
      setNeedsEmailForLink(false);
    } catch {
      setLinkError(
        "No hemos podido verificar ese email. Comprueba que sea correcto.",
      );
    }
  }, []);

  return { user, loading, needsEmailForLink, linkError, confirmEmailForLink };
}
