import { Instrument_Sans, Newsreader } from "next/font/google";
import SiteFooter from "@/components/salon/SiteFooter";
import "./salon.css";

// Typography B (approved v5): Newsreader Light for headings, Instrument Sans
// for body copy and navigation.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400"],
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
    <div className={`salon ${newsreader.variable} ${instrumentSans.variable}`}>
      {children}
      <SiteFooter />
    </div>
  );
}
