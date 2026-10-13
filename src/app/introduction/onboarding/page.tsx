"use client";

import Section from "@/components/Section";
import OnboardingWizard from "@/components/introduction/OnboardingWizard";
import RequireIntroductionAuth from "@/components/introduction/RequireIntroductionAuth";
import RequireAccountChoice from "@/components/account/RequireAccountChoice";
import { OnboardingHeader } from "@/components/introduction/OnboardingFrame";

export default function OnboardingPage() {
  return (
    <RequireIntroductionAuth>
      {(uid) => (
        <RequireAccountChoice>
          <OnboardingHeader />
          <Section as="main" size="sm">
            <OnboardingWizard uid={uid} />
          </Section>
        </RequireAccountChoice>
      )}
    </RequireIntroductionAuth>
  );
}
