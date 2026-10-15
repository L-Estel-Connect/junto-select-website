"use client";

import AutomaticIntroductionsGate from "@/components/member/AutomaticIntroductionsGate";
import Section from "@/components/Section";
import ProposalsSection from "@/components/member/ProposalsSection";
import { useMemberUid } from "@/components/member/MemberContext";

function MemberProposalsPageContent() {
  const uid = useMemberUid();
  return (
    <Section as="main" size="sm">
      <ProposalsSection uid={uid} />
    </Section>
  );
}

export default function MemberProposalsPage() {
  return (
    <AutomaticIntroductionsGate>
      <MemberProposalsPageContent />
    </AutomaticIntroductionsGate>
  );
}
