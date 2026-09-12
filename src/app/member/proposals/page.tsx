"use client";

import Section from "@/components/Section";
import ProposalsSection from "@/components/member/ProposalsSection";
import { useMemberUid } from "@/components/member/MemberContext";

export default function MemberProposalsPage() {
  const uid = useMemberUid();
  return (
    <Section as="main" size="sm">
      <ProposalsSection uid={uid} />
    </Section>
  );
}
