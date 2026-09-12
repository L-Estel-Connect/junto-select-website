"use client";

import Section from "@/components/Section";
import PreferencesSection from "@/components/introduction/PreferencesSection";
import { useMemberUid } from "@/components/member/MemberContext";

export default function MemberPreferencesPage() {
  const uid = useMemberUid();
  return (
    <Section as="main" size="md">
      <PreferencesSection uid={uid} />
    </Section>
  );
}
