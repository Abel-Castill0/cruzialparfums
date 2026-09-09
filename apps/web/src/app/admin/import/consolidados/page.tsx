import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminImportCampaignsRepository } from "@/domains/admin-import/campaigns-repository";
import { campaignStatusLabel, isCampaignStatus } from "@/domains/admin-import/campaign-schema";
import styles from "@/app/admin/parfums/productos/page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Consolidados" };
const PAGE_SIZE = 20;

export default async function ConsolidadosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminSession();
  if (session.status === "not_configured" || session.status === "unavailable" || session.status === "no_membership") redirect("/admin");
  if (session.status === "signed_out") redirect("/admin/login");
  const membership = session.session.memberships.find((candidate) => candidate.businessUnitCode === "import");
  if (!membership) redirect("/admin");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin");

  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const status = isCampaignStatus(params.status) ? params.status : undefined;
  const includeArchived = params.archived === "1";
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : "1") || 1);

  const repository = new AdminImportCampaignsRepository(supabase, membership.businessUnitId);
  const result = await repository.list(
    { search, includeArchived, ...(status ? { status } : {}) },
    { page, pageSize: PAGE_SIZE },
  );

  if (!result.ok) {
    return <div className={styles.page}><main><p className={styles.notice} role="alert">No se pudieron cargar los consolidados. Intenta de nuevo.</p></main></div>;
  }

  const { items, total, pageSize } = result.data;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const cleanParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") cleanParams.set(key, value);
  const paginationHref = (nextPage: number) => {
    const next = new URLSearchParams(cleanParams);
    next.set("page", String(nextPage));
    return `?${next.toString()}` as Route;
  };
  const noFilters = !search && !status && !includeArchived;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/import" className={styles.back}>← Cruzial Import</Link>
          <h1>Consolidado / Campañas</h1>
          <p>{total} consolidado{total === 1 ? "" : "s"} en esta vista.</p>
        </div>
        {membership.role === "admin" ? (
          <Link href="/admin/import/consolidados/nuevo" className={styles.createLink}>+ Nuevo consolidado</Link>
        ) : null}
      </header>
      <main>
        {items.length === 0 ? (
          <p className={styles.empty}>{noFilters ? "Aún no hay consolidados." : "No hay consolidados que coincidan con estos filtros."}</p>
        ) : (
          <>
            <ul className={styles.list} aria-label="Lista de consolidados">
              {items.map((campaign) => (
                <li key={campaign.id} className={styles.row}>
                  <Link href={`/admin/import/consolidados/${campaign.id}`} className={styles.rowLink}>
                    <div className={styles.rowMain}>
                      <strong>#{campaign.number} — {campaign.name}</strong>
                      <span className={styles.rowMeta}>
                        {campaign.opens_at ? `Abre ${new Date(campaign.opens_at).toLocaleString("es-PE", { timeZone: "America/Lima" })}` : "Sin apertura definida"}
                        {" · "}
                        {campaign.closes_at ? `Cierra ${new Date(campaign.closes_at).toLocaleString("es-PE", { timeZone: "America/Lima" })}` : "Sin cierre definido"}
                      </span>
                    </div>
                    <div className={styles.rowBadges}>
                      <span className={`${styles.badge} ${styles[`status-${campaign.status}`] ?? ""}`}>{campaignStatusLabel(campaign.status)}</span>
                      {campaign.archived_at ? <span className={styles.badgeArchived}>Archivado</span> : null}
                    </div>
                    <div className={styles.rowStats}>
                      <span>Actualizado {new Date(campaign.updated_at).toLocaleDateString("es-PE")}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {totalPages > 1 ? (
              <nav className={styles.pagination} aria-label="Paginación">
                {page > 1 ? <Link href={paginationHref(page - 1)}>← Anterior</Link> : <span aria-disabled="true">← Anterior</span>}
                <span>Página {page} de {totalPages}</span>
                {page < totalPages ? <Link href={paginationHref(page + 1)}>Siguiente →</Link> : <span aria-disabled="true">Siguiente →</span>}
              </nav>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
