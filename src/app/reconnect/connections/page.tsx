"use client";

import Section from "@/components/Section";
import RequireReconnectAuth from "@/components/reconnect/RequireReconnectAuth";
import ReconnectConnectionsList from "@/components/reconnect/ReconnectConnectionsList";

export default function ReconnectConnectionsPage() {
  return (
    <RequireReconnectAuth nextPath="/reconnect/connections">
      {(uid) => (
        <Section as="main" size="sm">
          <ReconnectConnectionsList uid={uid} />
        </Section>
      )}
    </RequireReconnectAuth>
  );
}
