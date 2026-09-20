import type { Metadata } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import { getIndexingPolicy, getSiteUrl } from "@/lib/seo/site";
import "./globals.css";

const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const body = Jost({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

// Every response carries a per-request CSP nonce (src/proxy.ts); a
// prerendered page could not receive one and its hydration script would be
// blocked. Nothing here is worth a build-time snapshot anyway.
export const dynamic = "force-dynamic";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: siteUrl } : {}),
  title: {
    default: "Cruzial",
    template: "%s — Cruzial",
  },
  description: "Cruzial Parfums y Cruzial Import en una sola plataforma.",
  robots: getIndexingPolicy(),
  openGraph: {
    type: "website",
    locale: "es_PE",
    siteName: "Cruzial",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${display.variable} ${body.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>{children}</body>
    </html>
  );
}
