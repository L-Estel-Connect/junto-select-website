import Hero from "@/components/Hero";
import WhoYouMeet from "@/components/WhoYouMeet";
import PrivateSection from "@/components/PrivateSection";
import MembershipSection from "@/components/MembershipSection";
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
      <WhoYouMeet />
      <div className="bg-rose-tint/40">
        <PrivateSection />
      </div>
      <MembershipSection />
      <InvitationSection />
      <Footer />
    </main>
  );
}
