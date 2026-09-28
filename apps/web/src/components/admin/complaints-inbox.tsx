import type { ComplaintStatus } from "@/domains/complaints/complaint-schema";
import {
  COMPLAINT_FILTER_TABS,
  complaintListHref,
  emptyComplaintsMessage,
} from "@/domains/complaints/complaint-presentation";
import {
  ActionLink,
  AdminPage,
  AdminPageHeader,
  EmptyState,
  FilterTabs,
  Notice,
  Pagination,
} from "./admin-ui";
import { ComplaintSearch } from "./complaint-search";
import { ComplaintList, type ComplaintListRow } from "./complaint-list";
import catalogStyles from "./catalog-workspace.module.css";

export type ComplaintsInboxProps = {
  unitName: string;
  basePath: string;
  canWrite: boolean;
  filters: { search: string; status: string; urgency: string };
  /** Totals per stored status; null when they could not be read. */
  counts: Record<ComplaintStatus, number> | null;
  /** Unresolved cases already past their deadline; null when unverified. */
  overdueCount: number | null;
  result:
    | { ok: true; rows: readonly ComplaintListRow[]; total: number; page: number; totalPages: number }
    | { ok: false };
  hrefForPage: (page: number) => string;
};

/** Shared complaint-book inbox for Parfums and Import. Presentation only:
 * the page has already authorized the member and loaded data through the
 * unit's repository with its existing filters and pagination. */
export function ComplaintsInbox({ unitName, basePath, canWrite, filters, counts, overdueCount, result, hrefForPage }: ComplaintsInboxProps) {
  const filtered = Boolean(filters.search);
  const tabs = COMPLAINT_FILTER_TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    href: complaintListHref(basePath, filters.search, tab.status),
    count: tab.status === "" ? null : counts ? counts[tab.status] ?? 0 : null,
    current: filters.status === tab.status,
    tone: tab.key === "received" ? ("attention" as const) : ("neutral" as const),
  }));
  const empty = emptyComplaintsMessage(filters);

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={unitName}
        title="Libro de Reclamaciones"
        description="Revisa primero los reclamos que necesitan tu respuesta."
        meta={canWrite ? undefined : "Acceso de solo lectura: puedes consultar los reclamos, pero no cambiar su estado."}
      />

      {overdueCount !== null && overdueCount > 0 && filters.urgency !== "overdue" ? (
        <Notice
          tone="danger"
          title={`${overdueCount} ${overdueCount === 1 ? "reclamo tiene" : "reclamos tienen"} el plazo vencido`}
          action={
            <ActionLink href={`${basePath}?urgency=overdue`} variant="secondary">
              Ver reclamos con plazo vencido
            </ActionLink>
          }
        >
          {overdueCount === 1 ? "Ya pasó" : "Ya pasaron"} la fecha límite para responder.
        </Notice>
      ) : null}

      {filters.urgency === "overdue" ? (
        <Notice tone="neutral" title="Mostrando solo reclamos con plazo vencido" action={<ActionLink href={basePath} variant="secondary">Quitar este filtro</ActionLink>} />
      ) : null}

      <div className={catalogStyles.toolbar}>
        <FilterTabs tabs={tabs} label="Filtrar reclamos por estado" />
        <ComplaintSearch initial={filters.search} />
      </div>

      {!result.ok ? (
        <Notice tone="danger" title="No pudimos cargar los reclamos">Recarga la página.</Notice>
      ) : result.rows.length === 0 ? (
        <EmptyState title={empty.title}>{empty.detail}</EmptyState>
      ) : (
        <>
          <p className={catalogStyles.muted} aria-live="polite">
            {result.total} {result.total === 1 ? "reclamo" : "reclamos"}
            {filters.status || filters.urgency || filtered ? " en esta vista" : " en total"}
            {counts === null ? " · No pudimos verificar los totales por estado." : ""}
          </p>
          <ComplaintList rows={result.rows} />
          <Pagination page={result.page} totalPages={result.totalPages} hrefFor={hrefForPage} />
        </>
      )}
    </AdminPage>
  );
}
