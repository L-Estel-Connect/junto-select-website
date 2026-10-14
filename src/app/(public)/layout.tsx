import SiteFooter from "@/components/salon/SiteFooter";
import ScrollToTop from "@/components/salon/ScrollToTop";
import { instrumentSans, newsreader } from "@/lib/salon/fonts";
import "./salon.css";

/**
 * Public website ("Salón" identity). A route group, so URLs are unchanged
 * and the member area, onboarding and admin keep their own look. Each page
 * renders its own <SiteHeader> because the header sits over a photo on some
 * pages and on a plain background on others.
 */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`salon ${newsreader.variable} ${instrumentSans.variable}`}>
      <ScrollToTop />
      {children}
      <SiteFooter />
    </div>
  );
}
