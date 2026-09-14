"use client";

import Section from "@/components/Section";
import AboutMeEditSection from "@/components/introduction/AboutMeEditSection";
import { useMemberUid } from "@/components/member/MemberContext";

export default function MemberProfileAboutPage() {
  const uid = useMemberUid();
  return (
    <Section as="main" size="md">
      <AboutMeEditSection uid={uid} />
    </Section>
  );
}
