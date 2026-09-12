"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { completeRedirectSignIn, watchAuthState } from "./auth";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribed = false;

    completeRedirectSignIn().catch((error) => {
      console.error("Sign-in redirect failed", error);
    });

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

  return { user, loading };
}
