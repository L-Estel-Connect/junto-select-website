"use client";

import { useEffect, useState } from "react";
import { isDebugMode, useDebugEvents } from "@/lib/introduction/onboardingDebug";

/**
 * Renders nothing unless the page was loaded with `?debug=1` — see
 * onboardingDebug.ts. Fixed to the bottom of the viewport so it's
 * visible over whatever state (loading/error/content) the page is
 * actually in, which is the point: seeing exactly where a stuck load
 * stops advancing.
 *
 * `isDebugMode()` reads `window.location.search`, which doesn't exist
 * during server rendering — checking it directly during render would
 * make the server's output (always "no window" -> not debug mode) and
 * the client's hydration-pass output (real window, so possibly debug
 * mode) disagree, a hydration mismatch. Deferring the check to an effect
 * (which only ever runs client-side, after hydration) avoids that: both
 * the server and the client's first render agree on "render nothing",
 * and the overlay appears an instant later once mounted.
 */
export default function DebugOverlay() {
  const events = useDebugEvents();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // The standard hydration-safe "client-only content" pattern: this
    // MUST run once, unconditionally, after mount — there is no
    // do-it-during-render alternative, since the entire point is to
    // render identically to the server on the first pass and only then
    // reveal client-only state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted || !isDebugMode()) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: "45vh",
        overflowY: "auto",
        background: "rgba(20, 20, 20, 0.92)",
        color: "#7CFC7C",
        fontFamily: "monospace",
        fontSize: "11px",
        lineHeight: 1.5,
        padding: "8px 10px",
        zIndex: 999999,
        whiteSpace: "pre-wrap",
      }}
    >
      <div style={{ color: "#fff", marginBottom: 4 }}>
        onboarding debug ({events.length} events) — also logged to console
      </div>
      {events.length === 0 && <div>waiting for first event…</div>}
      {events.map((e, i) => (
        <div key={i}>
          +{e.t}ms {e.label}
          {e.detail ? `  — ${e.detail}` : ""}
        </div>
      ))}
    </div>
  );
}
