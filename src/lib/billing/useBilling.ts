"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { emptyBillingDocument, type BillingDocument } from "./types";

/**
 * Real-time listener on this member's own `billing/{uid}` document — the
 * mechanism that makes "never trust `success_url`, wait for the verified
 * webhook" actually work in the UI: after a Stripe Checkout redirect back
 * to `/member/plan`, this hook doesn't poll or assume success from the
 * URL — it just keeps rendering whatever `billing/{uid}` currently says,
 * and the screen updates itself the instant the webhook (running
 * entirely server-side, independently of this page) writes the real
 * result. `billing/{uid}` is owner-readable but never client-writable
 * (see firestore.rules), so this is a read-only mirror of Stripe's state.
 */
export function useBilling(uid: string) {
  const [billing, setBilling] = useState<BillingDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ref = doc(db, "billing", uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setBilling(snap.exists() ? (snap.data() as BillingDocument) : emptyBillingDocument);
        setLoading(false);
        setError(null);
      },
      () => {
        setError("No hemos podido cargar el estado de tu membresía.");
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [uid]);

  return { billing, loading, error };
}
