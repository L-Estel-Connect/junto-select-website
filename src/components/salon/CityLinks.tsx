import Link from "next/link";
import { CITIES, joinHref } from "@/lib/site/content";

/** Every city opens the community form with that city already selected. */
export default function CityLinks() {
  return (
    <ul className="clist">
      {CITIES.map((c) => (
        <li key={c.slug} className={c.status === "activo" ? "on" : undefined}>
          <Link href={joinHref(c.slug)} aria-label={`${c.name}: ${c.statusLabel}. Únete al club`}>
            <h3>{c.name}</h3>
            <span>{c.statusLabel}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
