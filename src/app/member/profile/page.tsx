"use client";

import Section from "@/components/Section";
import MemberProfileSection from "@/components/introduction/MemberProfileSection";
import { useMemberUid } from "@/components/member/MemberContext";

export default function MemberProfilePage() {
  const uid = useMemberUid();
  return (
    <Section as="main" size="sm">
      <MemberProfileSection uid={uid} />
    </Section>
  );
}
