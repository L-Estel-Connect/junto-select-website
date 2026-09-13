import Link from "next/link";
import Section from "./Section";
import { eyebrowClasses, primaryButtonClasses } from "@/lib/styles";

/**
 * The public homepage's only bridge into Junto Select Introduction (the
 * membership/matching product at /introduction) — everything else on this
 * page is the separate events-waitlist product. Links to /introduction,
 * not /member/plan: an anonymous visitor can't reach /member/plan (it's
 * gated behind sign-in + finished onboarding), so /introduction — sign
 * in, then onboarding, then eventually the real purchase at
 * /member/plan — is the only route that actually works for someone
 * arriving here cold. No parallel purchase flow is introduced; this is
 * purely a navigational entry point into the existing one.
 */
export default function MembershipSection() {
  return (
    <Section size="md" className="py-16 sm:py-20">
      <div className="mx-auto max-w-[640px] rounded-2xl border border-hairline bg-white px-8 py-12 text-center sm:px-14 sm:py-16">
        <p className={eyebrowClasses}>Junto Select Membership</p>

        <h2 className="mt-4 font-serif text-[26px] font-normal leading-snug text-ink sm:text-[30px]">
          Deja que Junto Select busque por ti.
        </h2>

        <p className="mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
          Activa tu búsqueda y recibe hasta 3 perfiles seleccionados para ti
          cada mes, siempre priorizando la calidad sobre la cantidad.
        </p>

        <ul className="mx-auto mt-8 max-w-[38ch] space-y-3 text-left text-[14px] leading-relaxed text-ink">
          <li className="flex gap-3">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-soft" />
            <span>Selecciones privadas y personalizadas</span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-soft" />
            <span>Ventajas y descuentos en eventos Junto Select</span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-soft" />
            <span>Sin swiping. Sin catálogo. Nosotros buscamos por ti.</span>
          </li>
        </ul>

        <Link href="/introduction" className={`${primaryButtonClasses} mt-9 inline-flex`}>
          Hazte miembro
        </Link>

        <p className="mt-4 text-[12px] text-ink-soft">
          Desde 49 € · Cancela la renovación cuando quieras.
        </p>
      </div>
    </Section>
  );
}
