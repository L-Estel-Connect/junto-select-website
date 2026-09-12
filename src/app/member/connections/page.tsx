"use client";

import Section from "@/components/Section";
import ConnectionsSection from "@/components/member/ConnectionsSection";
import { useMemberUid } from "@/components/member/MemberContext";

export default function MemberConnectionsPage() {
  const uid = useMemberUid();
  return (
    <Section as="main" size="sm">
      <ConnectionsSection uid={uid} />
    </Section>
  );
}
