"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Opens every page of the public site at the top. Next.js keeps the scroll
 * position whenever part of the new page is already on screen, so a footer
 * link clicked at the bottom of a long page could open a short page at its
 * bottom. Links to a section (`#…`) keep scrolling to that section.
 */
export default function ScrollToTop() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
