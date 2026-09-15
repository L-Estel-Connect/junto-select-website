import { eyebrowClasses } from "@/lib/styles";
import type { MemberIntroductionView } from "@/lib/matching/memberLifecycleTypes";
import PublicProfileCard from "./PublicProfileCard";

function formatDate(value: unknown): string | null {
  const ts = value as { toDate?: () => Date } | null | undefined;
  const date = ts?.toDate ? ts.toDate() : null;
  if (!date) return null;
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * The payoff of the whole lifecycle: a confirmed mutual introduction, the
 * other party's profile, and ONLY the contact methods they actually stored
 * and authorized (see buildRevealedContacts — never fabricated, never a
 * full dump of contactPreferences). No chat exists in V1 — this is
 * deliberately a read-only "here's how to reach them," not an inbox.
 */
export default function IntroductionCard({ introduction }: { introduction: MemberIntroductionView }) {
  if (!introduction.other) {
    return (
      <div className="rounded-2xl border border-hairline bg-white p-6 text-center">
        <p className="text-[15px] text-ink-soft">Esta persona ya no está disponible.</p>
      </div>
    );
  }

  const name = introduction.other.firstName || "esta persona";
  const date = formatDate(introduction.createdAt);

  return (
    <div className="rounded-2xl border border-hairline bg-white p-6">
      <p className={eyebrowClasses}>El interés es mutuo ✨</p>
      <p className="mt-3 max-w-[46ch] text-[18px] leading-snug text-ink">
        {name} también quiere conocerte.
      </p>
      {date && <p className="mt-1 text-[13px] text-ink-soft">Introducción del {date}.</p>}

      <div className="mt-6">
        <PublicProfileCard profile={introduction.other} />
      </div>

      <div className="mt-6 border-t border-hairline pt-6">
        <p className="text-[15px] text-ink">
          Ya podéis poneros en contacto directamente. Junto Select no tiene chat interno, así que estos
          son el modo de continuar — úsalos únicamente para esta introducción y con respeto a la
          privacidad de {name}.
        </p>
        {introduction.contacts.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {introduction.contacts.map((contact) => (
              <li key={contact.method} className="flex items-center justify-between border-b border-hairline py-2 text-[14px]">
                <span className="text-ink-soft">{contact.label}</span>
                <span className="font-medium text-ink">{contact.value}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-ink-soft">
            {name} todavía no ha añadido ningún método de contacto.
          </p>
        )}
      </div>
    </div>
  );
}
