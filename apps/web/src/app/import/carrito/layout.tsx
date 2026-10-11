import type { Metadata } from "next";
import type { ReactNode } from "react";

// The page is a client component and cannot export metadata itself.
export const metadata: Metadata = {
  title: "Carrito",
  description: "Revisa los productos de tu carrito de Cruzial Import.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
