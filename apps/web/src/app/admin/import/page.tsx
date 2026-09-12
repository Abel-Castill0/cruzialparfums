import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsSettingsRepository } from "@/domains/admin-parfums/settings-repository";
import { AdminImportCatalogRepository } from "@/domains/admin-import/catalog-repository";
import { AdminImportOrdersRepository } from "@/domains/admin-import/orders-repository";
import { AdminImportCustomersRepository } from "@/domains/admin-import/customers-repository";
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

  const [qa, orderCounts, pendingCustomers, contactSetting] = await Promise.all([
    new AdminImportCatalogRepository(supabase, membership.businessUnitId).qa(),
    new AdminImportOrdersRepository(supabase, membership.businessUnitId).countByStatus(),
    new AdminImportCustomersRepository(supabase, membership.businessUnitId).countPendingVerification(),
    new AdminParfumsSettingsRepository(supabase, membership.businessUnitId, "import").getPublicContact(),
  ]);

  const pendingOrders = orderCounts?.pending_whatsapp_confirmation ?? 0;
  const confirmedOrders = orderCounts?.confirmed ?? 0;
  const contactConfigured = contactSetting.ok && contactSetting.data !== null;

  return (
    <div className={styles.page}>
      <header className={styles.header}><div><Link className={styles.back} href="/admin">← Administración</Link><h1>Cruzial Import</h1><p>Catálogo, QA de publicación, consolidados, pedidos, clientes y configuración.</p></div></header>
      <main>
        <nav className={styles.links}>
          <Link className={styles.linkCard} href={"/admin/import/productos" as Route}><strong>Productos</strong><span>Buscar, filtrar y mantener productos y presentaciones estructurales.</span></Link>
          <Link className={styles.linkCard} href="/admin/import/consolidados"><strong>Consolidado / Campañas</strong><span>Precios, disponibilidad y ciclo de vida por campaña.</span></Link>
          <Link className={styles.linkCard} href={"/admin/import/pedidos" as Route}><strong>Pedidos</strong><span>Bandeja de solicitudes, ciclo de vida y coordinación WhatsApp.</span></Link>
          <Link className={styles.linkCard} href={"/admin/import/clientes" as Route}><strong>Clientes</strong><span>Registro, verificación y gestión de clientes Import.</span></Link>
          <Link className={styles.linkCard} href={"/admin/import/configuracion" as Route}><strong>Configuración</strong><span>Contacto público: WhatsApp y correo visible para el cliente.</span></Link>
          <Link className={styles.linkCard} href={"/admin/import/auditoria" as Route}><strong>Auditoría</strong><span>Historial de cambios — solo lectura.</span></Link>
        </nav>
        <section className={styles.qaGrid} aria-label="Preparación operativa">
          <StatusCard label="Contacto público" status={contactConfigured ? "ok" : "missing"} />
          {qa.ok ? (
            <StatusCard label="Consolidado" status={qa.data.campaign_status === "draft" ? "draft" : qa.data.campaign_status === "open" ? "ok" : "missing"} />
          ) : null}
        </section>
        {(pendingOrders > 0 || confirmedOrders > 0 || (pendingCustomers ?? 0) > 0) ? (
          <section className={styles.qaGrid} aria-label="Operaciones pendientes">
            {pendingOrders > 0 ? <Card n={pendingOrders} label="solicitudes pendientes" /> : null}
            {confirmedOrders > 0 ? <Card n={confirmedOrders} label="pedidos confirmados" /> : null}
            {(pendingCustomers ?? 0) > 0 ? <Card n={pendingCustomers!} label="clientes sin verificar" /> : null}
          </section>
        ) : null}
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

function StatusCard({ label, status }: { label: string; status: "ok" | "draft" | "missing" }) {
  const badge = status === "ok" ? styles.good : status === "draft" ? styles.warning : styles.badge;
  const text = status === "ok" ? "Configurado" : status === "draft" ? "Borrador" : "Falta configurar";
  return (
    <div className={styles.qaCard}>
      <span className={badge}>{text}</span>
      <span>{label}</span>
    </div>
  );
}
