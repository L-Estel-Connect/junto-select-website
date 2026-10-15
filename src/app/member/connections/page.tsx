"use client";

import AutomaticIntroductionsGate from "@/components/member/AutomaticIntroductionsGate";
import Section from "@/components/Section";
import ConnectionsSection from "@/components/member/ConnectionsSection";
import { useMemberUid } from "@/components/member/MemberContext";

function MemberConnectionsPageContent() {
  const uid = useMemberUid();
  return (
    <Section as="main" size="sm">
      <ConnectionsSection uid={uid} />
    </Section>
  );
}

export default function MemberConnectionsPage() {
  return (
    <AutomaticIntroductionsGate>
      <MemberConnectionsPageContent />
    </AutomaticIntroductionsGate>
  );
}
