"use client";

import Section from "@/components/Section";
import MemberHome from "@/components/member/MemberHome";
import { useMemberUid } from "@/components/member/MemberContext";

export default function MemberHomePage() {
  const uid = useMemberUid();
  return (
    <Section as="main" size="sm">
      <MemberHome uid={uid} />
    </Section>
  );
}
