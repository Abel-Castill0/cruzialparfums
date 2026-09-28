import type { Route } from "next";
import Link from "next/link";
import {
  ActionLink,
  AdminPage,
  AdminPageHeader,
  EmptyState,
  Notice,
  Pagination,
  StatusBadge,
  adminButtonClass,
} from "@/components/admin/admin-ui";
import type { CampaignRow } from "@/domains/admin-import/campaigns-repository";
import { CAMPAIGN_STATUSES, campaignStatusLabel } from "@/domains/admin-import/campaign-schema";
import { campaignStatusPresentation, formatLimaDateTime } from "@/domains/admin-import/campaign-presentation";
import type { PublicImportCampaign } from "@/domains/import/public-import";
import styles from "./workspace.module.css";

/** Presentation only — the page authorized the member and loaded the list
 * through the existing repository filters/pagination. */
export function ConsolidadosListView({
  isAdmin,
  filters,
  page,
  result,
  publicCampaign,
  paginationHref,
}: {
  isAdmin: boolean;
  filters: { search: string; status: string; includeArchived: boolean };
  page: number;
  result: { ok: true; items: CampaignRow[]; total: number; pageSize: number } | { ok: false };
  publicCampaign: PublicImportCampaign | null | undefined;
  paginationHref: (page: number) => string;
}) {
  const { search, includeArchived } = filters;
  const status = filters.status;
  const header = (
    <AdminPageHeader
      eyebrow="Cruzial Import"
      title="Consolidados"
      description="Cada consolidado es un catálogo de importación con sus propios productos, precios, disponibilidad y fechas."
      meta={isAdmin ? undefined : "Acceso de solo lectura: puedes consultar los consolidados, pero no modificarlos."}
      actions={isAdmin ? <ActionLink href="/admin/import/consolidados/nuevo" variant="primary">Nuevo consolidado</ActionLink> : undefined}
    />
  );

  if (!result.ok) {
    return (
      <AdminPage>
        {header}
        <Notice tone="danger" title="No pudimos cargar los consolidados">Recarga la página e inténtalo otra vez.</Notice>
      </AdminPage>
    );
  }

  const { items, total, pageSize } = result;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const noFilters = !search && !status && !includeArchived;

  return (
    <AdminPage>
      {header}

      {publicCampaign === undefined ? (
        <Notice tone="attention" title="No pudimos verificar qué consolidado ven tus clientes">
          La lista se muestra igual; revisa la tienda antes de tomar decisiones sobre la apertura.
        </Notice>
      ) : publicCampaign ? (
        <Notice tone="healthy" title={`Tus clientes ven el Consolidado #${publicCampaign.number}`}>
          La tienda muestra “{publicCampaign.name}” y tus clientes pueden enviar solicitudes.
        </Notice>
      ) : (
        <Notice tone="neutral" title="Tus clientes no ven ningún consolidado ahora">
          La tienda muestra: “El próximo consolidado se está preparando.”
        </Notice>
      )}

      <form method="get" className={styles.filters} aria-label="Filtrar consolidados">
        <label>
          <span>Buscar por nombre</span>
          <input type="search" name="q" defaultValue={search} placeholder="Nombre del consolidado" />
        </label>
        <label>
          <span>Estado</span>
          <select name="status" defaultValue={status ?? ""}>
            <option value="">Todos los estados</option>
            {CAMPAIGN_STATUSES.map((candidate) => (
              <option key={candidate} value={candidate}>{campaignStatusLabel(candidate)}</option>
            ))}
          </select>
        </label>
        <label className={styles.checkbox}>
          <input type="checkbox" name="archived" value="1" defaultChecked={includeArchived} />
          <span>Incluir archivados</span>
        </label>
        <button type="submit" className={adminButtonClass("secondary")}>Filtrar</button>
        {!noFilters ? <ActionLink href="/admin/import/consolidados" variant="quiet">Quitar filtros</ActionLink> : null}
      </form>

      {items.length === 0 ? (
        <EmptyState title={noFilters ? "Todavía no hay consolidados." : "No hay consolidados que coincidan con estos filtros."}>
          {noFilters && isAdmin ? "Crea el primero para empezar a cargar productos y precios." : null}
        </EmptyState>
      ) : (
        <>
          <p className={styles.muted} aria-live="polite">{total} {total === 1 ? "consolidado" : "consolidados"} en esta vista.</p>
          <ul className={styles.campaignList} aria-label="Lista de consolidados">
            {items.map((campaign) => {
              const presentation = campaignStatusPresentation(campaign.status);
              const archived = campaign.archived_at !== null;
              const isPublic = publicCampaign ? publicCampaign.id === campaign.id : false;
              return (
                <li key={campaign.id}>
                  <Link href={`/admin/import/consolidados/${campaign.id}` as Route} className={styles.campaignRow}>
                    <span className={styles.campaignIdentity}>
                      <strong className={styles.campaignNumber}>Consolidado #{campaign.number}</strong>
                      <span className={styles.campaignName}>{campaign.name}</span>
                    </span>
                    <span className={styles.campaignState}>
                      <span className={styles.headerActions}>
                        <StatusBadge tone={archived ? "neutral" : presentation.tone}>{presentation.label}</StatusBadge>
                        {archived ? <StatusBadge tone="neutral">Archivado</StatusBadge> : null}
                        {isPublic ? <StatusBadge tone="healthy">Visible para clientes</StatusBadge> : null}
                      </span>
                      <span className={styles.muted}>{archived ? "Queda como historial." : presentation.publicConsequence}</span>
                    </span>
                    <span className={styles.campaignMeta}>
                      <span className={styles.muted}>Apertura: {campaign.opens_at ? formatLimaDateTime(campaign.opens_at) : "sin fecha"}</span>
                      <span className={styles.muted}>Cierre: {campaign.closes_at ? formatLimaDateTime(campaign.closes_at) : "sin fecha"}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} totalPages={totalPages} hrefFor={paginationHref} />
        </>
      )}
    </AdminPage>
  );
}
