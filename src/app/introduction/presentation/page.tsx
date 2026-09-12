"use client";

import Section from "@/components/Section";
import PresentationSection from "@/components/introduction/PresentationSection";
import RequireIntroductionAuth from "@/components/introduction/RequireIntroductionAuth";

export default function PresentationPage() {
  return (
    <RequireIntroductionAuth>
      {(uid) => (
        <Section as="main" size="sm">
          <PresentationSection uid={uid} />
        </Section>
      )}
    </RequireIntroductionAuth>
  );
}
