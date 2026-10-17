"use client";

import Section from "@/components/Section";
import MemberWelcome from "@/components/member/MemberWelcome";
import { useMemberUid } from "@/components/member/MemberContext";

export default function MemberWelcomePage() {
  const uid = useMemberUid();
  return (
    <Section as="main" size="sm">
      <MemberWelcome uid={uid} />
    </Section>
  );
}
