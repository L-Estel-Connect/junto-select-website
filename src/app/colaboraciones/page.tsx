import type { Metadata } from "next";
import CollaborationsHero from "@/components/colaboraciones/CollaborationsHero";
import WhyThisCommunity from "@/components/colaboraciones/WhyThisCommunity";
import PartnershipOffer from "@/components/colaboraciones/PartnershipOffer";
import OtherCollaborations from "@/components/colaboraciones/OtherCollaborations";
import CommunityGlimpse from "@/components/colaboraciones/CommunityGlimpse";
import CollaborationFormSection from "@/components/colaboraciones/CollaborationFormSection";
import Footer from "@/components/Footer";

const title = "Colaboraciones | Junto Select Madrid";
const description =
  "Conecta tu marca con la comunidad Junto Select. Colaboraciones y experiencias de marca en nuestros encuentros en Madrid.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: {
    canonical: "/colaboraciones",
  },
  openGraph: {
    title,
    description,
  },
  twitter: {
    title,
    description,
  },
};

export default function ColaboracionesPage() {
  return (
    <main className="flex flex-1 flex-col">
      <CollaborationsHero />
      <WhyThisCommunity />
      <div className="bg-rose-tint/40">
        <PartnershipOffer />
      </div>
      <OtherCollaborations />
      <CommunityGlimpse />
      <CollaborationFormSection />
      <Footer />
    </main>
  );
}
