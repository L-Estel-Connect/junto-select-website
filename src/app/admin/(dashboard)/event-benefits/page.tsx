import { redirect } from "next/navigation";

/** The old event-benefits page is now part of the Events Manager. */
export default function EventBenefitsRedirect() {
  redirect("/admin/eventos");
}
