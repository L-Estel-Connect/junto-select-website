"use client";

import Section from "@/components/Section";
import ContactSection from "@/components/introduction/ContactSection";
import { useMemberUid } from "@/components/member/MemberContext";

export default function MemberContactPage() {
  const uid = useMemberUid();
  return (
    <Section as="main" size="sm">
      <ContactSection uid={uid} />
    </Section>
  );
}
