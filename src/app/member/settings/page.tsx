"use client";

import Section from "@/components/Section";
import SettingsSection from "@/components/member/SettingsSection";
import { useMemberUid } from "@/components/member/MemberContext";

export default function MemberSettingsPage() {
  const uid = useMemberUid();
  return (
    <Section as="main" size="sm">
      <SettingsSection uid={uid} />
    </Section>
  );
}
