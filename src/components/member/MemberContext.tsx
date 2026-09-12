"use client";

import { createContext, useContext } from "react";

const MemberUidContext = createContext<string | null>(null);

export const MemberUidProvider = MemberUidContext.Provider;

/** The signed-in member's uid. Only valid inside MemberShell / the /member/** tree. */
export function useMemberUid(): string {
  const uid = useContext(MemberUidContext);
  if (!uid) {
    throw new Error("useMemberUid must be used within the /member layout");
  }
  return uid;
}
