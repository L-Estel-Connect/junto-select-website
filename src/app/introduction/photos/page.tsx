"use client";

import Section from "@/components/Section";
import PhotosSection from "@/components/introduction/PhotosSection";
import RequireIntroductionAuth from "@/components/introduction/RequireIntroductionAuth";

export default function PhotosPage() {
  return (
    <RequireIntroductionAuth>
      {(uid) => (
        <Section as="main" size="sm">
          <PhotosSection uid={uid} />
        </Section>
      )}
    </RequireIntroductionAuth>
  );
}
