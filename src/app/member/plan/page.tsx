"use client";

import Section from "@/components/Section";
import PlanSection from "@/components/member/PlanSection";
import { useMemberUid } from "@/components/member/MemberContext";

export default function MemberPlanPage() {
  const uid = useMemberUid();
  return (
    <Section as="main" size="sm">
      <PlanSection uid={uid} />
    </Section>
  );
}
