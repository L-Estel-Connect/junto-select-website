import { Instrument_Sans, Newsreader } from "next/font/google";

// Same typography as the public site (approved typography B): Newsreader
// Light for headings, Instrument Sans for everything else. Used by the
// Introducciones journey and the member area so they read as the same club.
export const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
  display: "swap",
});

export const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const salonAppClassName = `salon-app ${newsreader.variable} ${instrumentSans.variable}`;
