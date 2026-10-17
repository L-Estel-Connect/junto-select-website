import { Suspense } from "react";
import InstagramPanel from "./InstagramPanel";

/** Instagram comment-to-DM automation. Behind the admin layout's sign-in like every other admin page. */
export default function InstagramPage() {
  return (
    <Suspense>
      <InstagramPanel />
    </Suspense>
  );
}
