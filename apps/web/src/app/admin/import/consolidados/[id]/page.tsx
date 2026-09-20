import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminImportCampaignsRepository } from "@/domains/admin-import/campaigns-repository";
import { AdminImportCampaignProductsRepository } from "@/domains/admin-import/campaign-products-repository";
import { isValidUuid } from "@/domains/admin-import/campaign-schema";
import { resolveNextPreparationStep } from "@/domains/admin-import/campaign-preparation";
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
  if (session.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (session.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");
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
  // Bounded initial page only (4J2 correction) — the picker's own search
  // action (searchEligibleImportProductsAction) refines this client-side;
  // this SSR call never loads the whole Import catalog.
  const [campaignProducts, eligibleProducts, nextStep] = await Promise.all([
    productsRepository.getCampaignProducts(id),
    productsRepository.searchEligibleProducts({ query: "", limit: 20 }),
    result.data.archived_at === null ? resolveNextPreparationStep(supabase, id) : Promise.resolve(null),
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
        {nextStep ? (
          <section className={styles.section} aria-labelledby="preparation-assistant-title">
            <div className={styles.sectionTitle}>
              <h2 id="preparation-assistant-title">Asistente de preparación</h2>
            </div>
            <p className={styles.notice}>Siguiente problema a resolver: {nextStep.label}.</p>
            <Link
              href={`/admin/import/publicacion?blocker=${nextStep.blocker}&campaign=${id}`}
              className={styles.primaryButton}
            >
              Continuar preparación →
            </Link>
          </section>
        ) : result.data.archived_at === null ? (
          <section className={styles.section} aria-labelledby="preparation-assistant-title">
            <div className={styles.sectionTitle}>
              <h2 id="preparation-assistant-title">Asistente de preparación</h2>
            </div>
            <p className={styles.savedNote} role="status">
              No hay bloqueadores de publicación conocidos pendientes en este consolidado.
            </p>
          </section>
        ) : null}

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
