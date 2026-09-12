"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  completeMagicLinkSignIn,
  completeRedirectSignIn,
  getStoredEmailForSignIn,
  isMagicLinkUrl,
  watchAuthState,
} from "./auth";
import { auth } from "./client";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsEmailForLink, setNeedsEmailForLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribed = false;

    async function init() {
      await completeRedirectSignIn().catch((error) => {
        console.error("Sign-in redirect failed", error);
      });

      if (
        typeof window !== "undefined" &&
        !auth.currentUser &&
        isMagicLinkUrl(window.location.href)
      ) {
        const storedEmail = getStoredEmailForSignIn();
        if (storedEmail) {
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
          }
        } else if (!unsubscribed) {
          setNeedsEmailForLink(true);
        }
      }
    }

    init();

    const unsubscribe = watchAuthState((nextUser) => {
      if (unsubscribed) return;
      setUser(nextUser);
      setLoading(false);
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
