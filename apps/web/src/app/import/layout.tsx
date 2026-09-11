import type { Metadata } from "next";
import { ImportFooter } from "@/components/import/shell/import-footer";
import { ImportHeader } from "@/components/import/shell/import-header";

export const metadata: Metadata = {
  title: { default: "Cruzial Import", template: "%s | Cruzial Import" },
  description: "Importaciones, consolidados y productos seleccionados.",
};

export default function ImportLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div data-storefront="import">
      <ImportHeader />
      {children}
      <ImportFooter />
    </div>
  );
}
