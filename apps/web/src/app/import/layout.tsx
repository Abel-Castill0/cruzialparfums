import type { Metadata } from "next";
import { ImportFooter } from "@/components/import/shell/import-footer";
import { ImportHeader } from "@/components/import/shell/import-header";
import { ImportContactProvider } from "@/components/import/import-contact-context";
import { readImportPublicContact } from "@/domains/import/import-public-contact";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { default: "Cruzial Import", template: "%s | Cruzial Import" },
  description: "Importaciones, consolidados y productos seleccionados.",
};

export default async function ImportLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = createSupabasePublicServerClient();
  const contact = supabase ? await readImportPublicContact(supabase) : null;

  return (
    <div data-storefront="import">
      <ImportContactProvider contact={contact}>
        <ImportHeader />
        {children}
        <ImportFooter />
      </ImportContactProvider>
    </div>
  );
}
