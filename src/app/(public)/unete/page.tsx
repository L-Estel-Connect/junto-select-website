import type { Metadata } from "next";
import SiteHeader from "@/components/salon/SiteHeader";
import CommunityForm from "@/components/salon/CommunityForm";
import { COMMUNITY_CITIES, type CommunityCity } from "@/lib/types";

export const metadata: Metadata = {
  title: "Recibir invitaciones",
  description:
    "Recibe las invitaciones de Junto Select a encuentros exclusivos para solteros a partir de 40 y sé de los primeros cuando lleguemos a tu ciudad.",
  alternates: { canonical: "/unete" },
};

export default async function JoinPage({ searchParams }: PageProps<"/unete">) {
  const raw = (await searchParams).ciudad;
  const value = typeof raw === "string" ? raw.toLowerCase() : "";
  const initialCity = (COMMUNITY_CITIES as readonly string[]).includes(value) ? (value as CommunityCity) : "";
  const source = initialCity ? `web_ciudad_${initialCity}` : "web_unete";

  return (
    <main>
      <SiteHeader variant="solid" />
      <section className="form-page">
        <div className="wrap form-grid">
          <div className="form-aside">
            <p className="eyebrow">La comunidad</p>
            <h1>
              Recibe nuestras <em>invitaciones.</em>
            </h1>
            <p className="txt">
              Te escribimos con cada nuevo encuentro y serás de los primeros en saber cuándo llegamos a tu ciudad.
            </p>
            <p className="note">
              Hoy, los encuentros y las introducciones privadas funcionan en Madrid. Valencia, Barcelona y Málaga
              llegarán pronto.
            </p>
          </div>
          <CommunityForm key={initialCity} initialCity={initialCity} source={source} />
        </div>
      </section>
    </main>
  );
}
