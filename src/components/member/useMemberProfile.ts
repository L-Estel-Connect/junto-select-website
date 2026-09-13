"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import { requireFinalized } from "@/lib/introduction/completion";

/**
 * Shared fetch + "must be finalized" guard for the simple /member/**
 * shells (Proposals, Connections, Plan, Settings) — each just needs to
 * know the profile is ready to render, redirecting back into the
 * onboarding/profile flow otherwise wherever that flow says is next.
 *
 * Backed by the shared profile cache (profileCache.ts) — moving between
 * these tabs (or arriving here right after /member/profile) reuses
 * whatever copy is already in memory instead of each tab independently
 * re-fetching the same document.
 */
export function useMemberProfile(uid: string) {
  const router = useRouter();
  const { profile, error, refresh } = useSharedProfile(uid);

  useEffect(() => {
    if (!profile) return;
    const redirect = requireFinalized(profile);
    if (redirect) router.replace(redirect);
  }, [profile, router]);

  const ready = Boolean(profile) && !requireFinalized(profile!);
  return { profile, ready, error, refresh };
}
