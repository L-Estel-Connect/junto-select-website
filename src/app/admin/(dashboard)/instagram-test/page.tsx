import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isStagingDeploy } from "@/lib/config/deployEnv";
import InstagramTestPanel from "./InstagramTestPanel";

/** Temporary page for the Instagram access test. Staging only, not linked from the menu. */
export default function InstagramTestPage() {
  if (!isStagingDeploy()) notFound();
  return (
    <Suspense>
      <InstagramTestPanel />
    </Suspense>
  );
}
