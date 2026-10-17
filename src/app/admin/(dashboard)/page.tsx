import { redirect } from "next/navigation";

/** The admin starts at Clientes. The old overview is kept, unlinked, at /admin/resumen. */
export default function AdminHome() {
  redirect("/admin/clientes");
}
