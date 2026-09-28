import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ActionLink,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  AttentionList,
  Disclosure,
  EmptyState,
  FactList,
  FilterTabs,
  Notice,
  Pagination,
  StatusBadge,
  adminButtonClass,
} from "@/components/admin/admin-ui";
import { AdminImportCatalogRepository } from "@/domains/admin-import/catalog-repository";
import {
  PRODUCT_STATUS_LABELS,
  classifyProductReadiness,
  parseImportCatalogFilters,
  type ImportProductStatus,
} from "@/domains/admin-import/catalog-schema";
import { campaignStatusLabel } from "@/domains/admin-import/campaign-schema";
import { campaignStatusPresentation } from "@/domains/admin-import/campaign-presentation";
import { countCampaignBlockers } from "@/domains/admin-import/campaign-workspace-loader";
import { buildBlockerSummary, type BlockerCode } from "@/domains/admin-import/publication-blockers";
import {
  IMPORT_LIST_VIEWS,
  campaignSwitchHiddenParams,
  currentImportView,
  importViewHref,
} from "@/domains/admin-import/product-presentation";
import styles from "@/components/admin/catalog-workspace.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Productos Import" };

const BASE_PATH = "/admin/import/productos";

/** Campaign-scoped counts shown on this screen (same RPC + filter as the
 * "Revisión para publicar" lists they link to). */
const ATTENTION_CODES: readonly BlockerCode[] = [
  "offer_unconfirmed",
  "offer_invalid_price",
  "missing_offer",
  "product_unpublished",
  "presentation_unpublished",
  "no_active_presentations",
  "missing_primary_media",
];

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getAdminSession();
  if (session.status === "signed_out") redirect("/admin/login");
  if (session.status !== "ok") redirect("/admin");
  const member = session.session.memberships.find((m) => m.businessUnitCode === "import");
  if (!member) redirect("/admin");
  const client = await createSupabaseServerClient();
  if (!client) redirect("/admin");
  const isAdmin = member.role === "admin";

  const raw = await searchParams;
  const stringParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string") stringParams[key] = value;
  const filters = parseImportCatalogFilters(raw);
  const repo = new AdminImportCatalogRepository(client, member.businessUnitId);

  // Which consolidado (campaign) is being evaluated must be explicit — never
  // an implicit "current campaign" guess. ?campaign=<uuid> preserves the
  // operator's choice across filters, pagination, and product-detail links.
  const campaignsResult = await client
    .from("campaigns")
    .select("id,number,name,status,archived_at")
    .eq("business_unit_id", member.businessUnitId)
    .is("archived_at", null)
    .order("number", { ascending: false });
  const campaigns = campaignsResult.data ?? [];
  const requestedCampaignId = stringParams.campaign ?? "";
  const requestedMissing = requestedCampaignId !== "" && !campaigns.some((c) => c.id === requestedCampaignId);
  const selectedCampaign = requestedCampaignId
    ? campaigns.find((c) => c.id === requestedCampaignId) ?? null
    : campaigns[0] ?? null;

  const [result, categories, qa, blockerCounts] = await Promise.all([
    selectedCampaign ? repo.list(filters, selectedCampaign.id) : Promise.resolve({ ok: true as const, data: { items: [], total: 0 } }),
    client.from("categories").select("name,slug").eq("business_unit_id", member.businessUnitId).eq("kind", "import_category").is("archived_at", null).order("name"),
    repo.qa(),
    selectedCampaign ? countCampaignBlockers(client, selectedCampaign.id, ATTENTION_CODES) : Promise.resolve(null),
  ]);

  const params = { ...stringParams, ...(selectedCampaign ? { campaign: selectedCampaign.id } : {}) };
  const currentView = currentImportView(params);
  const tabs = IMPORT_LIST_VIEWS.map((view) => ({
    key: view.key,
    label: view.label,
    href: importViewHref(BASE_PATH, params, view),
    current: currentView === view.key,
  }));
  const productHref = (id: string) =>
    `${BASE_PATH}/${id}${selectedCampaign ? `?campaign=${selectedCampaign.id}` : ""}` as Route;
  const summary = selectedCampaign && blockerCounts ? buildBlockerSummary(blockerCounts, selectedCampaign.id, isAdmin) : null;
  const campaignPresentation = selectedCampaign ? campaignStatusPresentation(selectedCampaign.status) : null;
  const advancedActive = Boolean(filters.categorySlug || filters.presentationState || filters.archived !== "active" || (currentView === null && (filters.publicationStatus || filters.offerState || filters.mediaState)));

  return (
    <AdminPage width="wide">
      <AdminPageHeader
        eyebrow="Cruzial Import"
        title="Productos"
        description={selectedCampaign ? `Productos para el Consolidado #${selectedCampaign.number}.` : "Productos del catálogo de importación."}
        meta={isAdmin ? undefined : "Acceso de solo lectura: puedes consultar los productos, pero no modificarlos."}
      />

      {campaignsResult.error ? (
        <Notice tone="danger" title="No pudimos cargar los consolidados">Recarga la página antes de revisar productos.</Notice>
      ) : null}

      <section className={styles.summary} aria-labelledby="campaign-context-title">
        <div className={styles.summaryMain}>
          <h2 id="campaign-context-title" className={styles.eyebrow}>Consolidado que estás revisando</h2>
          {selectedCampaign && campaignPresentation ? (
            <>
              <p className={styles.headline}>
                Consolidado #{selectedCampaign.number} · {selectedCampaign.name}
              </p>
              <p className={styles.headerBadges}>
                <StatusBadge tone={campaignPresentation.tone}>{campaignPresentation.label}</StatusBadge>
                <span className={styles.muted}>{campaignPresentation.publicConsequence}</span>
              </p>
              <p className={styles.muted}>
                Precio y disponibilidad se ven para este consolidado. Los datos del producto son los mismos en todos.
              </p>
            </>
          ) : (
            <p className={styles.consequence}>
              {campaigns.length === 0 ? "No hay consolidados activos. Crea uno para revisar productos y ofertas." : "Elige un consolidado para revisar sus productos."}
            </p>
          )}
          {requestedMissing ? (
            <Notice tone="attention" title="No encontramos el consolidado del enlace">
              Puede estar archivado. Elige otro consolidado; no mostramos datos de uno distinto sin que lo elijas.
            </Notice>
          ) : null}
        </div>
        <div className={styles.summaryNext}>
          {campaigns.length > 0 ? (
            <form method="get" action={BASE_PATH} className={styles.filterBar} aria-label="Cambiar de consolidado">
              {campaignSwitchHiddenParams(stringParams).map(([key, value]) => (
                <input key={key} type="hidden" name={key} value={value} />
              ))}
              <label className={styles.field}>
                <span>Cambiar de consolidado</span>
                <select name="campaign" defaultValue={selectedCampaign?.id}>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>#{c.number} — {c.name} ({campaignStatusLabel(c.status)})</option>
                  ))}
                </select>
              </label>
              <button type="submit" className={adminButtonClass("secondary")}>Ver este consolidado</button>
            </form>
          ) : (
            <ActionLink href={isAdmin ? "/admin/import/consolidados/nuevo" : "/admin/import/consolidados"} variant="primary">
              {isAdmin ? "Crear consolidado" : "Ver consolidados"}
            </ActionLink>
          )}
        </div>
      </section>

      {selectedCampaign ? (
        <AdminSection
          id="atencion"
          title="Qué necesita atención"
          description={`Conteos del Consolidado #${selectedCampaign.number}. Cada uno abre la lista exacta de productos afectados.`}
        >
          {!summary ? null : summary.groups.length > 0 ? (
            <AttentionList
              label={`Pendientes del consolidado #${selectedCampaign.number}`}
              items={summary.groups.map((group, index) => ({
                key: group.code,
                title: `${group.label} · ${group.countText}`,
                detail: group.why,
                href: group.href,
                actionLabel: group.actionLabel,
                tone: index === 0 ? "attention" : "neutral",
              }))}
            />
          ) : summary.unverified.length === 0 ? (
            <EmptyState title="No hay productos con pendientes de publicación en este consolidado." />
          ) : null}
          {summary && summary.unverified.length > 0 ? (
            <Notice tone="attention" title="No pudimos verificar todos los conteos">Recarga la página; no asumas que no hay pendientes.</Notice>
          ) : null}
        </AdminSection>
      ) : null}

      <div className={styles.toolbar}>
        <FilterTabs tabs={tabs} label="Ver productos por situación" />
        <form method="get" action={BASE_PATH} className={styles.toolbar} aria-label="Buscar y filtrar productos">
          {selectedCampaign ? <input type="hidden" name="campaign" value={selectedCampaign.id} /> : null}
          <div className={styles.filterBar}>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              <span>Buscar</span>
              <input type="search" name="q" defaultValue={filters.query} placeholder="Nombre, marca o referencia" />
            </label>
            <button type="submit" className={adminButtonClass("secondary")}>Aplicar</button>
          </div>
          <details className={styles.advanced} open={advancedActive || undefined}>
            <summary>Más filtros{advancedActive ? " (activos)" : ""}</summary>
            <div className={`${styles.advancedBody} ${styles.filterBar}`}>
              <label className={styles.field}>
                <span>Publicación</span>
                <select name="status" defaultValue={filters.publicationStatus ?? ""}>
                  <option value="">Todos</option>
                  {Object.entries(PRODUCT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span>Categoría</span>
                <select name="category" defaultValue={filters.categorySlug ?? ""}>
                  <option value="">Todas</option>
                  {(categories.data ?? []).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span>Imágenes</span>
                <select name="media" defaultValue={filters.mediaState ?? ""}>
                  <option value="">Todas</option>
                  <option value="with_primary">Con imagen principal</option>
                  <option value="without_primary">Sin imagen principal</option>
                  <option value="without_media">Sin imagen</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Presentación</span>
                <select name="presentation" defaultValue={filters.presentationState ?? ""}>
                  <option value="">Todas</option>
                  <option value="with_active">Con presentación activa</option>
                  <option value="without_active">Sin presentación activa</option>
                  <option value="without_published">Sin presentación publicada</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Oferta en este consolidado</span>
                <select name="offer" defaultValue={filters.offerState ?? ""}>
                  <option value="">Todas</option>
                  <option value="with_offer">Con oferta</option>
                  <option value="without_offer">Sin oferta</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Archivo</span>
                <select name="archived" defaultValue={filters.archived}>
                  <option value="active">Activos</option>
                  <option value="archived">Archivados</option>
                  <option value="all">Todos</option>
                </select>
              </label>
              <button type="submit" className={adminButtonClass("secondary")}>Aplicar filtros</button>
            </div>
          </details>
        </form>
      </div>

      {!result.ok ? (
        <Notice tone="danger" title="No pudimos cargar los productos">Recarga la página. No asumas que el catálogo está vacío.</Notice>
      ) : result.data.items.length === 0 ? (
        <EmptyState title={selectedCampaign ? "No hay productos en esta vista." : "Selecciona un consolidado para ver productos y ofertas."}>
          {selectedCampaign && currentView !== "all" ? "Prueba con otra vista o quita filtros." : null}
        </EmptyState>
      ) : (
        <>
          <p className={styles.muted} aria-live="polite">{result.data.total} {result.data.total === 1 ? "producto" : "productos"} en esta vista.</p>
          <ul className={styles.list} aria-label="Lista de productos Import">
            {result.data.items.map((item) => {
              const readiness = classifyProductReadiness({
                productStatus: item.publication_status as ImportProductStatus,
                archived: !!item.archived_at,
                activePresentations: Number(item.active_presentations),
                publishedPresentations: Number(item.published_presentations),
                offerCount: Number(item.campaign_offer_count),
                unconfirmedOfferCount: Number(item.unconfirmed_offer_count),
                campaignStatus: selectedCampaign?.status ?? null,
              });
              const offers = Number(item.campaign_offer_count);
              const unconfirmed = Number(item.unconfirmed_offer_count);
              const status = item.publication_status as ImportProductStatus;
              // "Consolidado no abierto" is shared by every row of a closed
              // campaign; show the product's own first blocker instead.
              const ownBlocker = readiness.blockers.find((blocker) => blocker !== "Consolidado no abierto") ?? null;
              return (
                <li key={item.id}>
                  <Link href={productHref(item.id)} className={`${styles.row} ${styles.rowNoThumb}`}>
                    <span className={styles.identity}>
                      <strong className={styles.name}>{item.name}</strong>
                      <span className={styles.muted}>
                        {item.brand ?? "Sin marca"} · {item.category_name ?? "Sin categoría"} · {item.active_presentations} {Number(item.active_presentations) === 1 ? "presentación" : "presentaciones"}
                      </span>
                    </span>
                    <span className={styles.state}>
                      <span className={styles.badges}>
                        <StatusBadge tone={status === "published" && !item.archived_at ? "healthy" : "attention"}>
                          {item.archived_at ? "Archivado" : PRODUCT_STATUS_LABELS[status] ?? "Estado desconocido"}
                        </StatusBadge>
                        {offers === 0 ? (
                          <StatusBadge tone="attention">Sin oferta</StatusBadge>
                        ) : unconfirmed > 0 ? (
                          <StatusBadge tone="attention">{unconfirmed === 1 ? "1 sin confirmar" : `${unconfirmed} sin confirmar`}</StatusBadge>
                        ) : (
                          <StatusBadge tone="healthy">{offers === 1 ? "1 oferta confirmada" : `${offers} ofertas confirmadas`}</StatusBadge>
                        )}
                        {!item.has_active_primary ? (
                          <StatusBadge tone="neutral">{item.active_media_count > 0 ? "Sin foto principal" : "Sin fotos"}</StatusBadge>
                        ) : null}
                      </span>
                      <span className={styles.muted}>{ownBlocker ?? "Listo para este consolidado"}</span>
                    </span>
                    <span className={styles.figures}>
                      <span>{offers === 1 ? "1 oferta" : `${offers} ofertas`}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={filters.page}
            totalPages={Math.max(1, Math.ceil(result.data.total / filters.pageSize))}
            hrefFor={(next) => `${BASE_PATH}?${new URLSearchParams({ ...params, page: String(next) }).toString()}`}
          />
        </>
      )}

      <Disclosure summary="Resumen del catálogo completo" hint="Totales de todo Import, no solo de este consolidado">
        {qa.ok ? (
          <FactList
            items={[
              { term: "Productos activos", value: qa.data.products },
              { term: "Presentaciones activas", value: qa.data.presentations },
              {
                term: qa.data.campaign_number !== null ? `Ofertas en el consolidado más reciente (#${qa.data.campaign_number})` : "Ofertas (sin consolidado activo)",
                value: qa.data.campaign_offers,
              },
              { term: "Presentaciones sin oferta", value: qa.data.structures_without_offer },
              { term: "Productos sin foto principal", value: qa.data.products_without_primary_media },
              { term: "Productos sin fotos", value: qa.data.products_without_media },
            ]}
          />
        ) : (
          <p className={styles.muted}>No pudimos cargar el resumen del catálogo.</p>
        )}
      </Disclosure>
    </AdminPage>
  );
}
