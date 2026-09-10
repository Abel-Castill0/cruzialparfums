import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminImportCampaignsRepository } from "@/domains/admin-import/campaigns-repository";
import { AdminImportCampaignProductsRepository } from "@/domains/admin-import/campaign-products-repository";
import { isValidUuid } from "@/domains/admin-import/campaign-schema";
import { CampaignEditor } from "./campaign-editor";
import styles from "@/app/admin/parfums/productos/page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Consolidado" };

export default async function ConsolidadoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidUuid(id)) notFound();

  const session = await getAdminSession();
  if (session.status === "not_configured" || session.status === "unavailable" || session.status === "no_membership") redirect("/admin");
  if (session.status === "signed_out") redirect("/admin/login");
  const membership = session.session.memberships.find((candidate) => candidate.businessUnitCode === "import");
  if (!membership) redirect("/admin");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin");

  const repository = new AdminImportCampaignsRepository(supabase, membership.businessUnitId);
  const result = await repository.getById(id);
  if (!result.ok) {
    if (result.error.type === "not_found") notFound();
    return <div className={styles.page}><main><p className={styles.notice} role="alert">No se pudo cargar el consolidado. Intenta de nuevo.</p></main></div>;
  }

  const productsRepository = new AdminImportCampaignProductsRepository(supabase, membership.businessUnitId);
  const [campaignProducts, eligibleProducts] = await Promise.all([
    productsRepository.getCampaignProducts(id),
    productsRepository.listEligibleProducts(),
  ]);

  if (!campaignProducts.ok || !eligibleProducts.ok) {
    return <div className={styles.page}><main><p className={styles.notice} role="alert">No se pudieron cargar los productos del consolidado. Intenta de nuevo.</p></main></div>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/import/consolidados" className={styles.back}>← Consolidado / Campañas</Link>
          <h1>#{result.data.number} — {result.data.name}</h1>
        </div>
      </header>
      <main>
        <CampaignEditor
          campaign={result.data}
          campaignProducts={campaignProducts.data}
          eligibleProducts={eligibleProducts.data}
          disabled={membership.role !== "admin"}
        />
      </main>
    </div>
  );
}
