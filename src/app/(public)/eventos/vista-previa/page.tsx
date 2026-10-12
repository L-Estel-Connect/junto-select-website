import type { Metadata } from "next";
import SiteHeader from "@/components/salon/SiteHeader";
import EventPreview from "@/components/events/EventPreview";

export const metadata: Metadata = {
  title: "Vista previa del evento",
  robots: { index: false, follow: false },
};

/**
 * Admin-only preview of one event's public card, inside the real public
 * layout (Salón styles, typography B), so it looks exactly as it will on
 * Encuentros. The data is fetched with the admin's own session; anyone
 * else sees nothing.
 */
export default async function EventPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await searchParams;
  return (
    <main>
      <SiteHeader variant="solid" />
      <section className="page-intro">
        <div className="wrap">
          <p className="eyebrow">Vista previa · no publicada</p>
          <h1>
            Así se verá <em>tu encuentro.</em>
          </h1>
        </div>
      </section>
      <section className="events">
        <div className="wrap">
          <EventPreview id={typeof id === "string" ? id : ""} />
        </div>
      </section>
    </main>
  );
}
