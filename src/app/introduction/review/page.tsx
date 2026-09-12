"use client";

import Section from "@/components/Section";
import ReviewSection from "@/components/introduction/ReviewSection";
import RequireIntroductionAuth from "@/components/introduction/RequireIntroductionAuth";

export default function ReviewPage() {
  return (
    <RequireIntroductionAuth>
      {(uid) => (
        <Section as="main" size="sm">
          <ReviewSection uid={uid} />
        </Section>
      )}
    </RequireIntroductionAuth>
  );
}
