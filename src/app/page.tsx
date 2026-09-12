import Hero from "@/components/Hero";
import PhotoBreak from "@/components/PhotoBreak";
import WhoYouMeet from "@/components/WhoYouMeet";
import PrivateSection from "@/components/PrivateSection";
import InvitationSection from "@/components/InvitationSection";
import Footer from "@/components/Footer";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Junto Select",
  url: "https://juntoselect.com",
  description:
    "Junto Select organiza encuentros privados y cuidadosamente seleccionados para solteros y solteras 40+ en Madrid.",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Madrid",
    addressCountry: "ES",
  },
};

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <Hero />
      <PhotoBreak label="Rooftop al atardecer, brindis con champán en Madrid" />
      <WhoYouMeet />
      <PhotoBreak label="Interior con velas, ambiente íntimo y elegante" />
      <PrivateSection />
      <InvitationSection />
      <Footer />
    </main>
  );
}
