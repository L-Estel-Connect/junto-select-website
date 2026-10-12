import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import SiteFooter from "@/components/salon/SiteFooter";
import "./salon.css";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

/**
 * Public website ("Salón" identity). A route group, so URLs are unchanged
 * and the member area, onboarding and admin keep their own look. Each page
 * renders its own <SiteHeader> because the header sits over a photo on some
 * pages and on a plain background on others.
 */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`salon ${instrumentSerif.variable} ${instrumentSans.variable}`}>
      {children}
      <SiteFooter />
    </div>
  );
}
