"use client";

import Section from "@/components/Section";
import ProfileHome from "@/components/introduction/ProfileHome";
import RequireIntroductionAuth from "@/components/introduction/RequireIntroductionAuth";

export default function ProfileHomePage() {
  return (
    <RequireIntroductionAuth>
      {(uid) => (
        <Section as="main" size="sm">
          <ProfileHome uid={uid} />
        </Section>
      )}
    </RequireIntroductionAuth>
  );
}
