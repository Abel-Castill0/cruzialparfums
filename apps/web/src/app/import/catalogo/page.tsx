import type { Metadata } from "next";
import { ImportCatalog, ImportCategoryTiles } from "@/components/import/home/import-catalog";
import { ImportPreviewCatalog } from "@/components/import/home/import-home-view";
import { ImportClosedNotice } from "@/components/import/home/import-closed-notice";
import { parsePublicImportFilters } from "@/domains/import/public-import";
import { PublicImportRepository } from "@/domains/import/public-import-repository";
import { readImportPublicContact } from "@/domains/import/import-public-contact";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import styles from "@/components/import/home/import-home.module.css";

export const metadata: Metadata = {
  title: "Catálogo del consolidado",
  description: "Explora los productos, presentaciones y condiciones disponibles de Cruzial Import.",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ImportCatalogPage({ searchParams }: PageProps) {
  const filters = parsePublicImportFilters(await searchParams);
  const supabase = createSupabasePublicServerClient();
  const contact = supabase ? await readImportPublicContact(supabase) : null;
  const result = supabase
    ? await new PublicImportRepository(supabase).readCatalog(filters)
    : { status: "unavailable" as const };

  return (
    <main className={`${styles.home} ${styles.catalogPage}`}>
      <header className={styles.catalogPageHeader}>
        <p className={styles.eyebrow}>Cruzial Import</p>
        <h1>Catálogo del consolidado</h1>
        <p>Consulta productos, presentaciones y precios de la campaña publicada.</p>
      </header>
      {result.status === "active" ? (
        <>
          {!filters.query && !filters.category && filters.page === 1 ? <ImportCategoryTiles result={result} filters={filters} /> : null}
          <ImportCatalog result={result} filters={filters} />
        </>
      ) : result.status === "upcoming" ? (
        <ImportPreviewCatalog result={result} filters={filters} />
      ) : (
        <ImportClosedNotice contact={contact} unavailable={result.status === "unavailable"} informationHref="/import#como-funciona" />
      )}
    </main>
  );
}
