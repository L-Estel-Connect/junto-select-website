"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateProfile } from "@/lib/introduction/profile";
import { requireFinalized } from "@/lib/introduction/completion";
import type { ProfileDocument } from "@/lib/introduction/types";

/**
 * Shared fetch + "must be finalized" guard for the simple /member/**
 * shells (Proposals, Connections, Plan, Settings) — each just needs to
 * know the profile is ready to render, redirecting back into the
 * onboarding/profile flow otherwise wherever that flow says is next.
 */
export function useMemberProfile(uid: string) {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileDocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrCreateProfile(uid).then((doc) => {
      if (!cancelled) setProfile(doc);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    if (!profile) return;
    const redirect = requireFinalized(profile);
    if (redirect) router.replace(redirect);
  }, [profile, router]);

  const ready = Boolean(profile) && !requireFinalized(profile!);
  return { profile, ready };
}
