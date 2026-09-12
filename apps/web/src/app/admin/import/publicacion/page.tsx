import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminImportCatalogRepository } from "@/domains/admin-import/catalog-repository";
import styles from "../productos/page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Publicación Import" };

export default async function Page() {
  const session = await getAdminSession();
  if (session.status === "signed_out") redirect("/admin/login");
  if (session.status !== "ok") redirect("/admin");
  const member = session.session.memberships.find((m) => m.businessUnitCode === "import");
  if (!member) redirect("/admin");
  const client = await createSupabaseServerClient();
  if (!client) redirect("/admin");

  const repo = new AdminImportCatalogRepository(client, member.businessUnitId);
  const rpc = client.rpc.bind(client) as unknown as (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  const [qa, readinessResult] = await Promise.all([repo.qa(), rpc("admin_get_import_publication_readiness")]);

  const readiness = ((readinessResult.data ?? {}) as Record<string, unknown>) ?? {};
  const campaignStatus = (readiness.campaign_status as string) ?? "unknown";
  const campaignNumber = (readiness.campaign_number as number) ?? 6;
  const totalProducts = Number(readiness.total_products ?? 0);
  const readyProducts = Number(readiness.ready_products ?? 0);
  const mediaBlockers = Number(readiness.media_blockers ?? 0);
  const publicationBlockers = Number(readiness.publication_blockers ?? 0);
  const unconfirmedOffers = Number(readiness.unconfirmed_offers ?? 0);

  const allClear = mediaBlockers === 0 && publicationBlockers === 0 && unconfirmedOffers === 0 && campaignStatus === "open";
  const campaignStatusLabels: Record<string, string> = {
    draft: "Borrador", scheduled: "Programado", open: "Abierto", paused: "Pausado", closed: "Cerrado", completed: "Completado", archived: "Archivado",
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link className={styles.back} href="/admin/import">← Cruzial Import</Link>
          <h1>Publicación</h1>
          <p>Preparación de lanzamiento — datos reales de staging</p>
        </div>
      </header>
      <main>
        <section className={styles.panel}>
          <h2>Estado del consolidado</h2>
          <dl className={styles.facts}>
            <div>
              <dt>Consolidado</dt>
              <dd>#{campaignNumber}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>{campaignStatusLabels[campaignStatus] ?? campaignStatus}</dd>
            </div>
          </dl>
          {campaignStatus !== "open" ? (
            <p className={styles.help}>El consolidado debe estar en estado &quot;Abierto&quot; para lanzar. La apertura se realiza desde la pantalla de consolidados.</p>
          ) : null}
        </section>

        <section className={styles.panel}>
          <h2>Lanzamiento</h2>
          <div className={`${styles.qaGrid}`}>
            <div className={`${styles.qaCard} ${allClear ? "" : styles.warning}`}>
              <strong>{allClear ? "LISTO" : "NO LISTO"}</strong>
              <span>{allClear ? "Para apertura manual" : "Bloqueadores pendientes"}</span>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <h2>Resumen</h2>
          <div className={styles.qaGrid}>
            <div className={styles.qaCard}>
              <strong>{totalProducts}</strong>
              <span>productos activos</span>
            </div>
            <div className={`${styles.qaCard} ${readyProducts === totalProducts ? "" : styles.good}`}>
              <strong>{readyProducts}</strong>
              <span>listos para publicar</span>
            </div>
            <div className={`${styles.qaCard} ${mediaBlockers > 0 ? styles.warning : ""}`}>
              <strong>{mediaBlockers}</strong>
              <span>bloqueados por media</span>
            </div>
            <div className={`${styles.qaCard} ${publicationBlockers > 0 ? styles.warning : ""}`}>
              <strong>{publicationBlockers}</strong>
              <span>no publicados</span>
            </div>
            <div className={`${styles.qaCard} ${unconfirmedOffers > 0 ? styles.warning : ""}`}>
              <strong>{unconfirmedOffers}</strong>
              <span>ofertas sin confirmar</span>
            </div>
          </div>
        </section>

        {qa.ok ? (
          <section className={styles.panel}>
            <h2>Cobertura de media</h2>
            <div className={styles.qaGrid}>
              <div className={`${styles.qaCard} ${Number(qa.data.products_without_primary_media) > 0 ? styles.warning : ""}`}>
                <strong>{qa.data.products_with_primary_media}</strong>
                <span>con imagen principal</span>
              </div>
              <div className={`${styles.qaCard} ${Number(qa.data.products_without_primary_media) > 0 ? styles.warning : ""}`}>
                <strong>{qa.data.products_without_primary_media}</strong>
                <span>sin imagen principal</span>
              </div>
              <div className={`${styles.qaCard} ${Number(qa.data.products_without_media) > 0 ? styles.warning : ""}`}>
                <strong>{qa.data.products_without_media}</strong>
                <span>sin media alguna</span>
              </div>
              <div className={styles.qaCard}>
                <strong>{qa.data.total_active_media}</strong>
                <span>media activa total</span>
              </div>
            </div>
          </section>
        ) : null}

        <section className={styles.panel}>
          <h2>Acciones</h2>
          <p className={styles.help}>
            Esta pantalla muestra el estado de preparación. No ejecuta publicaciones automáticas.
            Para publicar productos, edítalos individualmente desde <Link href="/admin/import/productos">Productos</Link>.
            Para abrir el consolidado, ve a <Link href="/admin/import/consolidados">Consolidados</Link>.
          </p>
        </section>
      </main>
    </div>
  );
}
