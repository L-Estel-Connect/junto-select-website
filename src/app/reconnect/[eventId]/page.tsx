"use client";

import { useParams } from "next/navigation";
import Section from "@/components/Section";
import RequireReconnectAuth from "@/components/reconnect/RequireReconnectAuth";
import ReconnectHome from "@/components/reconnect/ReconnectHome";

export default function ReconnectEventPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;

  return (
    <RequireReconnectAuth eventId={eventId}>
      {(uid) => (
        <Section as="main" size="sm">
          <ReconnectHome uid={uid} eventId={eventId} />
        </Section>
      )}
    </RequireReconnectAuth>
  );
}
