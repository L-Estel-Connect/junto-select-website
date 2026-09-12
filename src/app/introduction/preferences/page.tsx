"use client";

import Section from "@/components/Section";
import PreferencesSection from "@/components/introduction/PreferencesSection";
import RequireIntroductionAuth from "@/components/introduction/RequireIntroductionAuth";

export default function PreferencesPage() {
  return (
    <RequireIntroductionAuth>
      {(uid) => (
        <Section as="main" size="md">
          <PreferencesSection uid={uid} />
        </Section>
      )}
    </RequireIntroductionAuth>
  );
}
