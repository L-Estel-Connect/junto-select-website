"use client";

import { useEffect } from "react";
import { signOutUser } from "@/lib/firebase/auth";

/** The account no longer exists on the server; this clears the browser's own session too. */
export default function SignOutOnMount() {
  useEffect(() => {
    void signOutUser().catch(() => {});
  }, []);
  return null;
}
