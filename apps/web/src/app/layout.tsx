import type { Metadata } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import {
  resolveIndexingPolicy,
  type DeploymentEnvironment,
} from "@/lib/seo/indexing-policy";
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

export const metadata: Metadata = {
  title: {
    default: "Cruzial",
    template: "%s — Cruzial",
  },
  description: "Cruzial Parfums y Cruzial Import en una sola plataforma.",
  robots: resolveIndexingPolicy({
    deploymentEnvironment: (process.env.VERCEL_ENV ??
      "development") as DeploymentEnvironment,
    cutoverApproved:
      process.env.CRUZIAL_PRODUCTION_CUTOVER_APPROVED === "true",
  }),
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
