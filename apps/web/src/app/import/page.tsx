import type { Metadata } from "next";
import { ImportHomeView, type ImportHomePage } from "@/components/import/home/import-home-view";
import { parsePublicImportFilters } from "@/domains/import/public-import";
import { PublicImportRepository } from "@/domains/import/public-import-repository";
import { readImportPublicContact } from "@/domains/import/import-public-contact";
import { readImportDepositPercentages } from "@/domains/import/import-deposit-policies";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  // Absolute: a page in the same segment as its layout gets the root template.
  title: { absolute: "Consolidados y catálogo | Cruzial Import" },
  description: "Consulta el consolidado vigente y el catálogo público de Cruzial Import.",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ImportHomePageRoute({ searchParams }: PageProps) {
  const filters = parsePublicImportFilters(await searchParams);
  const supabase = createSupabasePublicServerClient();

  if (!supabase) {
    return (
      <ImportHomeView
        page={{ status: "unavailable" }}
        filters={filters}
        contact={null}
        depositPercentages={{ new: null, returning: null }}
        wholesaleRules={[]}
      />
    );
  }

  const repository = new PublicImportRepository(supabase);
  const [catalogResult, contact, depositPercentages, wholesaleRules] = await Promise.all([
    repository.readCatalog(filters),
    readImportPublicContact(supabase),
    readImportDepositPercentages(supabase),
    repository.readWholesaleRules(),
  ]);

  const page: ImportHomePage = catalogResult.status === "error" ? { status: "unavailable" } : catalogResult;

  return (
    <ImportHomeView
      page={page}
      filters={filters}
      contact={contact}
      depositPercentages={depositPercentages}
      wholesaleRules={wholesaleRules}
    />
  );
}
