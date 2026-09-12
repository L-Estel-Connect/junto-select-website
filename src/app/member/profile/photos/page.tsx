"use client";

import Section from "@/components/Section";
import PhotosSection from "@/components/introduction/PhotosSection";
import { useMemberUid } from "@/components/member/MemberContext";

export default function MemberPhotosPage() {
  const uid = useMemberUid();
  return (
    <Section as="main" size="sm">
      <PhotosSection uid={uid} />
    </Section>
  );
}
