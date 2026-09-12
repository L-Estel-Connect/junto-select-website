"use client";

import Section from "@/components/Section";
import PresentationSection from "@/components/introduction/PresentationSection";
import { useMemberUid } from "@/components/member/MemberContext";

export default function MemberPresentationPage() {
  const uid = useMemberUid();
  return (
    <Section as="main" size="sm">
      <PresentationSection uid={uid} />
    </Section>
  );
}
