import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import { getAppBaseUrl } from "@/lib/config/appBaseUrl";
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
const title = "Junto Select — Encuentros privados para solteros en Madrid";
const description =
  "Junto Select organiza encuentros privados y cuidadosamente seleccionados para solteros y solteras 40+ en Madrid. Sin apps, sin eventos masivos: una lista de invitados seleccionada y espacios con encanto.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s — Junto Select",
  },
  description,
  keywords: [
    "citas Madrid",
    "encuentros para solteros Madrid",
    "eventos para solteros Madrid",
    "singles events Madrid",
    "dating events Madrid",
    "curated dating Madrid",
    "solteros 40+ Madrid",
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
  robots: {
    index: true,
    follow: true,
  },
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
