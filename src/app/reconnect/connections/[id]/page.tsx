"use client";

import { useParams } from "next/navigation";
import Section from "@/components/Section";
import RequireReconnectAuth from "@/components/reconnect/RequireReconnectAuth";
import ReconnectConnectionDetail from "@/components/reconnect/ReconnectConnectionDetail";

export default function ReconnectConnectionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  return (
    <RequireReconnectAuth nextPath={`/reconnect/connections/${id}`}>
      {() => (
        <Section as="main" size="sm">
          <ReconnectConnectionDetail id={id} />
        </Section>
      )}
    </RequireReconnectAuth>
  );
}
