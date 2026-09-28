import type { Route } from "next";
import Link from "next/link";
import {
  ActionLink,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  AttentionList,
  Disclosure,
  EmptyState,
  FactList,
  Notice,
  Pagination,
  StatusBadge,
  adminButtonClass,
} from "@/components/admin/admin-ui";
import type { ImportCatalogQa } from "@/domains/admin-import/catalog-repository";
import { campaignStatusLabel } from "@/domains/admin-import/campaign-schema";
import { campaignStatusPresentation } from "@/domains/admin-import/campaign-presentation";
import type { ImportReadinessJson } from "@/domains/admin-import/campaign-workspace-loader";
import {
  BLOCKER_FILTER_OPTIONS,
  blockerLabel,
  buildBlockerSummary,
  type BlockerCode,
} from "@/domains/admin-import/publication-blockers";
import styles from "./publication.module.css";

export const PAGE_SIZE = 20;

export type PublicationBlockerRow = {
  product_id: string;
  product_name: string;
  brand: string | null;
  slug: string;
  presentation_id: string | null;
  presentation_label: string | null;
  offer_id: string | null;
  blocker_code: string;
  blocker_label: string;
  total_count: number;
};

type PickerCampaign = { id: string; number: number; name: string; status: string };

export function PublicationHeader() {
  return (
    <AdminPageHeader
      eyebrow="Cruzial Import"
      title="Revisión para publicar"
      description="¿Qué impide publicar este consolidado? Resuelve primero lo que aparece arriba."
      meta="Esta pantalla solo revisa: no publica productos ni abre el consolidado."
    />
  );
}

/** Presentation only: every count comes from the readiness RPC and the
 * blocker-list RPC's own total_count per filter; nothing is recomputed. */
export function PublicationReviewView({
  campaigns,
  selectedCampaign,
  isAdmin,
  readiness,
  blockerCounts,
  blockers,
  qa,
  filters,
}: {
  campaigns: readonly PickerCampaign[];
  selectedCampaign: PickerCampaign;
  isAdmin: boolean;
  readiness: ImportReadinessJson | null;
  blockerCounts: Partial<Record<BlockerCode, number | null>>;
  blockers: PublicationBlockerRow[] | null;
  qa: ImportCatalogQa | null;
  filters: { q: string; blocker: string; page: number };
}) {
  const searchQuery = filters.q;
  const blockerQuery = filters.blocker;
  const page = filters.page;
  const header = <PublicationHeader />;
  const readyForManualOpen = readiness ? readiness.ready_for_manual_open ?? null : null;
  const summary = buildBlockerSummary(blockerCounts, selectedCampaign.id, isAdmin);
  const status = campaignStatusPresentation(selectedCampaign.status);

  const listTotal = blockers ? Number(blockers[0]?.total_count ?? 0) : 0;
  const totalPages = Math.max(1, Math.ceil(listTotal / PAGE_SIZE));
  const listHref = (nextPage: number) => {
    const next = new URLSearchParams({ campaign: selectedCampaign.id });
    if (blockerQuery) next.set("blocker", blockerQuery);
    if (searchQuery) next.set("q", searchQuery);
    next.set("page", String(nextPage));
    return `/admin/import/publicacion?${next.toString()}#detalle`;
  };
  const verificationFailed = readiness === null || summary.unverified.length > 0;

  return (
    <AdminPage width="wide">
      {header}

      <CampaignPicker campaigns={campaigns} selectedId={selectedCampaign.id} />

      <section className={styles.overview} aria-labelledby="overview-title">
        <div className={styles.overviewMain}>
          <h2 id="overview-title" className={styles.overviewTitle}>
            Consolidado #{selectedCampaign.number}
            <span>{selectedCampaign.name}</span>
          </h2>
          <p className={styles.overviewLine}>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            <span>{status.publicConsequence}</span>
          </p>
        </div>
        <div className={styles.overviewVerdict}>
          {readyForManualOpen === true && summary.unverified.length === 0 ? (
            <>
              <StatusBadge tone="healthy">Listo para abrir</StatusBadge>
              <p>La revisión no encontró bloqueadores. Abrirlo sigue siendo una decisión manual desde el consolidado.</p>
            </>
          ) : readyForManualOpen === false ? (
            <>
              <StatusBadge tone="attention">Todavía no está listo</StatusBadge>
              <p>
                {summary.groups.length > 0
                  ? `${summary.groups.length} ${summary.groups.length === 1 ? "tipo de problema impide" : "tipos de problema impiden"} publicarlo.`
                  : "Hay bloqueadores pendientes."}
              </p>
            </>
          ) : (
            <>
              <StatusBadge tone="attention">Sin verificar</StatusBadge>
              <p>No pudimos confirmar si está listo. Recarga la página antes de decidir.</p>
            </>
          )}
          <ActionLink href={`/admin/import/consolidados/${selectedCampaign.id}`} variant="secondary">
            {isAdmin ? "Ir al consolidado" : "Ver consolidado"}
          </ActionLink>
        </div>
      </section>

      <AdminSection
        id="bloqueadores"
        title="Qué impide publicarlo"
        description="En orden de prioridad: primero lo que oculta más productos a tus clientes."
      >
        {verificationFailed ? (
          <Notice tone="attention" title="No pudimos verificar todo">
            {summary.unverified.length > 0
              ? `Sin verificar: ${summary.unverified.map(blockerLabel).join(", ")}.`
              : "La revisión general del consolidado no respondió."}{" "}
            Recarga la página; no asumas que no hay bloqueadores.
          </Notice>
        ) : null}
        {summary.groups.length > 0 ? (
          <AttentionList
            label={`Bloqueadores del consolidado #${selectedCampaign.number}`}
            items={summary.groups.map((group, index) => ({
              key: group.code,
              title: `${group.label} · ${group.countText}`,
              detail: group.why,
              href: group.href,
              actionLabel: group.actionLabel,
              tone: index === 0 ? "attention" : "neutral",
            }))}
          />
        ) : !verificationFailed ? (
          <EmptyState title="Este consolidado no tiene bloqueadores de publicación.">
            Esto cubre productos, presentaciones, imágenes, precios y disponibilidad. Revisa también sus fechas y su estado antes de abrirlo.
          </EmptyState>
        ) : null}
      </AdminSection>

      <AdminSection
        id="detalle"
        title="Productos a revisar"
        description="Cada fila es un problema concreto. Abre el producto para corregirlo."
      >
        <form method="get" action="/admin/import/publicacion#detalle" className={styles.filters} aria-label="Filtrar productos a revisar">
          <input type="hidden" name="campaign" value={selectedCampaign.id} />
          <label>
            <span>Buscar producto</span>
            <input type="search" name="q" defaultValue={searchQuery} placeholder="Nombre o marca" />
          </label>
          <label>
            <span>Tipo de problema</span>
            <select name="blocker" defaultValue={blockerQuery}>
              <option value="">Todos los problemas</option>
              {BLOCKER_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <button type="submit" className={adminButtonClass("secondary")}>Filtrar</button>
          {searchQuery || blockerQuery ? (
            <ActionLink href={`/admin/import/publicacion?campaign=${selectedCampaign.id}#detalle`} variant="quiet">Quitar filtros</ActionLink>
          ) : null}
        </form>

        {blockers === null ? (
          <Notice tone="danger" title="No pudimos cargar la lista de problemas">
            Recarga la página. No asumas que no hay bloqueadores.
          </Notice>
        ) : listTotal === 0 ? (
          <EmptyState title={searchQuery || blockerQuery ? "No hay bloqueadores que coincidan con estos filtros." : "No hay bloqueadores en la lista de este consolidado."} />
        ) : (
          <>
            <p className={styles.muted} aria-live="polite">{listTotal} {listTotal === 1 ? "problema" : "problemas"} en esta vista.</p>
            <table className={styles.blockerTable}>
              <caption className={styles.srOnly}>Productos con problemas de publicación</caption>
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Presentación</th>
                  <th scope="col">Problema</th>
                  <th scope="col"><span className={styles.srOnly}>Acción</span></th>
                </tr>
              </thead>
              <tbody>
                {blockers.map((b, i) => (
                  <tr key={`${b.product_id}-${b.blocker_code}-${b.offer_id ?? "null"}-${i}`}>
                    <td data-label="Producto">
                      <strong>{b.product_name}</strong>
                      {b.brand ? <span className={styles.muted}> · {b.brand}</span> : null}
                    </td>
                    <td data-label="Presentación">{b.presentation_label ?? "—"}</td>
                    <td data-label="Problema">{blockerLabel(b.blocker_code)}</td>
                    <td>
                      <Link
                        className={styles.rowAction}
                        href={`/admin/import/productos/${b.product_id}?campaign=${selectedCampaign.id}` as Route}
                      >
                        {isAdmin ? "Corregir" : "Ver"}<span className={styles.srOnly}> {b.product_name}</span> <span aria-hidden="true">→</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} hrefFor={listHref} label="Páginas de productos a revisar" />
          </>
        )}
      </AdminSection>

      <Disclosure summary="Ver detalle técnico" hint="Contadores de la revisión y cobertura de imágenes del catálogo">
        {readiness ? (
          <FactList
            items={[
              { term: "Productos activos (catálogo)", value: Number(readiness.total_products ?? 0) },
              { term: "Productos listos para publicar", value: Number(readiness.ready_products ?? 0) },
              { term: "Bloqueos comerciales (oferta, precio, disponibilidad)", value: Number(readiness.commercial_blockers ?? 0) },
              { term: "Bloqueos por imagen", value: Number(readiness.media_blockers ?? 0) },
              { term: "Bloqueos de publicación", value: Number(readiness.publication_blockers ?? 0) },
              { term: "Ofertas sin confirmar", value: Number(readiness.unconfirmed_offer_count ?? 0) },
              { term: "Ofertas con precio inválido", value: Number(readiness.invalid_price_offer_count ?? 0) },
              { term: "Listo para apertura manual", value: readyForManualOpen === null ? "Sin verificar" : readyForManualOpen ? "Sí" : "No" },
            ]}
          />
        ) : (
          <p className={styles.muted}>No pudimos obtener los contadores de la revisión.</p>
        )}
        {qa ? (
          <FactList
            items={[
              { term: "Productos con imagen principal", value: qa.products_with_primary_media },
              { term: "Productos sin imagen principal", value: qa.products_without_primary_media },
              { term: "Productos sin ninguna imagen", value: qa.products_without_media },
              { term: "Imágenes activas en total", value: qa.total_active_media },
            ]}
          />
        ) : (
          <p className={styles.muted}>No pudimos obtener la cobertura de imágenes.</p>
        )}
        <p className={styles.muted}>
          Para publicar productos, edítalos desde{" "}
          <Link href={`/admin/import/productos?campaign=${selectedCampaign.id}` as Route}>Productos</Link>. Para abrir el consolidado, usa
          “Estado del consolidado” en <Link href={`/admin/import/consolidados/${selectedCampaign.id}` as Route}>su ficha</Link>.
        </p>
      </Disclosure>
    </AdminPage>
  );
}


export function CampaignPicker({
  campaigns,
  selectedId,
}: {
  campaigns: readonly PickerCampaign[];
  selectedId: string;
}) {
  return (
    <form method="get" className={styles.filters} aria-label="Elegir consolidado">
      <label>
        <span>Consolidado a revisar</span>
        <select name="campaign" defaultValue={selectedId || campaigns[0]?.id}>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.number} — {c.name} ({campaignStatusLabel(c.status)})
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={adminButtonClass("secondary")}>Ver este consolidado</button>
    </form>
  );
}
