import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import { getAppBaseUrl } from "@/lib/config/appBaseUrl";
import { isStagingDeploy } from "@/lib/config/deployEnv";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["300", "400", "500"],
  display: "swap",
});

// Environment-aware on purpose — see src/lib/config/appBaseUrl.ts. Moving
// to the juntoselect.com custom domain means changing APP_BASE_URL only;
// this file (and robots.ts/sitemap.ts) never needs editing for that move.
const siteUrl = getAppBaseUrl();
const title = "Junto Select · Club social privado para solteros en Madrid";
const description =
  "Un club privado para solteros que buscan algo extraordinario. Encuentros exclusivos en Madrid, experiencias elegidas con cuidado e introducciones privadas. Pronto en Valencia, Barcelona y Málaga.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s — Junto Select",
  },
  description,
  keywords: [
    "club de solteros Madrid",
    "club social para solteros",
    "club privado para solteros",
    "eventos para solteros Madrid",
    "eventos exclusivos para solteros",
    "introducciones privadas",
    "matchmaking privado Madrid",
  ],
  authors: [{ name: "Junto Select" }],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: siteUrl,
    siteName: "Junto Select",
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  // Staging must never be indexed.
  robots: isStagingDeploy() ? { index: false, follow: false } : { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fdfbfa",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} ${fraunces.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-paper font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
