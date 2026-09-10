import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminImportCatalogRepository } from "@/domains/admin-import/catalog-repository";
import styles from "./productos/page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Cruzial Import Admin" };

export default async function AdminImportPage() {
  const result = await getAdminSession();

  if (result.status === "not_configured") redirect("/admin");
  if (result.status === "unavailable") redirect("/admin");
  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "no_membership") redirect("/admin");

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "import",
  );
  if (!membership) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin");
  const qa = await new AdminImportCatalogRepository(supabase, membership.businessUnitId).qa();

  return (
    <div className={styles.page}>
      <header className={styles.header}><div><Link className={styles.back} href="/admin">← Administración</Link><h1>Cruzial Import</h1><p>Catálogo, QA de publicación y consolidados.</p></div></header>
      <main>
        <nav className={styles.links}>
          <Link className={styles.linkCard} href={"/admin/import/productos" as Route}><strong>Productos</strong><span>Buscar, filtrar y mantener productos y presentaciones estructurales.</span></Link>
          <Link className={styles.linkCard} href="/admin/import/consolidados"><strong>Consolidado / Campañas</strong><span>Precios, disponibilidad y ciclo de vida por campaña.</span></Link>
        </nav>
        {qa.ok ? <>
          <section className={styles.qaGrid} aria-label="Estado del catálogo">
            <Card n={qa.data.products} label="productos activos"/><Card n={qa.data.presentations} label="presentaciones activas"/><Card n={qa.data.active_campaigns} label="campañas no archivadas"/><Card n={qa.data.campaign_offers} label={`ofertas en #${qa.data.campaign_number ?? 6}`}/><Card n={qa.data.draft_products} label="productos en borrador"/><Card n={qa.data.published_products} label="productos publicados"/><Card n={qa.data.unconfirmed_offers} label="ofertas por confirmar"/><Card n={qa.data.out_of_stock_offers} label="ofertas agotadas"/><Card n={qa.data.structures_without_offer} label="estructuras sin oferta"/>
          </section>
          <section className={styles.panel}><h2>Visibilidad pública</h2><p className={styles.help}>El consolidado #{qa.data.campaign_number ?? 6} está en estado <strong>{qa.data.campaign_status ?? "sin configurar"}</strong>. La preparación estructural, la preparación comercial y la visibilidad pública son controles distintos; este panel no publica ni abre campañas automáticamente.</p></section>
        </> : <p className={styles.error}>No se pudieron cargar los contadores de QA.</p>}
        <p className={styles.session}>Sesión: {result.session.email ?? "sin correo"} · {membership.role === "admin" ? "Administrador" : "Solo lectura"}</p>
      </main>
    </div>
  );
}

function Card({ n, label }: { n: number; label: string }) {
  return <div className={styles.qaCard}><strong>{n}</strong><span>{label}</span></div>;
}
