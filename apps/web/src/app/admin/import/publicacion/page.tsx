import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminImportCatalogRepository } from "@/domains/admin-import/catalog-repository";
import styles from "../productos/page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Publicacion Import" };

const BLOCKER_LABELS: Record<string, string> = {
  product_unpublished: "Producto no publicado",
  presentation_unpublished: "Presentacion no publicada",
  missing_primary_media: "Sin imagen principal",
  missing_offer: "Sin oferta en consolidado",
  offer_unconfirmed: "Disponibilidad por confirmar",
  offer_invalid_price: "Precio invalido",
  offer_invalid_availability: "Estado de disponibilidad invalido",
  no_active_presentations: "Sin presentaciones activas",
};

type BlockerRow = {
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

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const session = await getAdminSession();
  if (session.status === "signed_out") redirect("/admin/login");
  if (session.status !== "ok") redirect("/admin");
  const member = session.session.memberships.find(
    (m) => m.businessUnitCode === "import",
  );
  if (!member) redirect("/admin");
  const client = await createSupabaseServerClient();
  if (!client) redirect("/admin");

  const repo = new AdminImportCatalogRepository(client, member.businessUnitId);
  const rpc = client.rpc.bind(client) as unknown as (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;

  const blockerQuery = params.blocker ?? "";
  const searchQuery = params.q ?? "";
  const page = Math.max(1, Number(params.page ?? 1));
  const [qaResult, readinessResult, blockersResult] = await Promise.all([
    repo.qa(),
    rpc("admin_get_import_publication_readiness"),
    rpc("admin_list_import_publication_blockers", {
      p_query: searchQuery || null,
      p_blocker: blockerQuery || null,
      p_page: page,
      p_page_size: 20,
    }),
  ]);

  const rpcError = readinessResult.error;
  const readiness = ((readinessResult.data ?? {}) as Record<string, unknown>) ?? {};
  const campaignStatus = (readiness.campaign_status as string) ?? "unknown";
  const campaignNumber = (readiness.campaign_number as number) ?? 6;
  const campaignExists = (readiness.campaign_exists as boolean) ?? false;
  const totalProducts = Number(readiness.total_products ?? 0);
  const readyProducts = Number(readiness.ready_products ?? 0);
  const commercialBlockers = Number(readiness.commercial_blockers ?? 0);
  const mediaBlockers = Number(readiness.media_blockers ?? 0);
  const publicationBlockers = Number(readiness.publication_blockers ?? 0);
  const unconfirmedOfferCount = Number(readiness.unconfirmed_offer_count ?? 0);
  const invalidPriceOfferCount = Number(readiness.invalid_price_offer_count ?? 0);
  const readyForManualOpen = (readiness.ready_for_manual_open as boolean) ?? false;

  const blockers = (blockersResult.data ?? []) as BlockerRow[];
  const blockerTotal = blockers[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(blockerTotal / 20));

  const campaignStatusLabels: Record<string, string> = {
    draft: "Borrador",
    scheduled: "Programado",
    open: "Abierto",
    paused: "Pausado",
    closed: "Cerrado",
    completed: "Completado",
    archived: "Archivado",
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link className={styles.back} href="/admin/import">
            &larr; Cruzial Import
          </Link>
          <h1>Publicacion</h1>
          <p>Preparacion de lanzamiento</p>
        </div>
      </header>
      <main>
        {rpcError ? (
          <section className={`${styles.panel} ${styles.warning}`}>
            <h2>Error de datos</h2>
            <p className={styles.help}>
              No se pudo obtener la informacion de preparacion. Error:{" "}
              {rpcError.message}. Intenta recargar la pagina.
            </p>
          </section>
        ) : (
          <>
            <section className={styles.panel}>
              <h2>Consolidado #{campaignNumber}</h2>
              <dl className={styles.facts}>
                <div>
                  <dt>Estado</dt>
                  <dd>{campaignStatusLabels[campaignStatus] ?? campaignStatus}</dd>
                </div>
                <div>
                  <dt>Existe</dt>
                  <dd>{campaignExists ? "Si" : "No"}</dd>
                </div>
              </dl>
              {!campaignExists ? (
                <p className={styles.help}>
                  No se encontro el consolidado #6. Esto es un bloqueador.
                </p>
              ) : campaignStatus !== "open" ? (
                <p className={styles.help}>
                  El consolidado no esta abierto. La apertura se realiza desde
                  consolidados.
                </p>
              ) : null}
            </section>

            <section className={styles.panel}>
              <h2>Lanzamiento</h2>
              <div className={styles.qaGrid}>
                <div
                  className={`${styles.qaCard} ${readyForManualOpen ? styles.good : styles.warning}`}
                >
                  <strong>
                    {readyForManualOpen ? "LISTO" : "NO LISTO"}
                  </strong>
                  <span>
                    {readyForManualOpen
                      ? "Para apertura manual"
                      : "Bloqueadores pendientes"}
                  </span>
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
                <div
                  className={`${styles.qaCard} ${readyProducts === totalProducts && totalProducts > 0 ? styles.good : ""}`}
                >
                  <strong>{readyProducts}</strong>
                  <span>listos para publicar</span>
                </div>
                <div
                  className={`${styles.qaCard} ${commercialBlockers > 0 ? styles.warning : ""}`}
                >
                  <strong>{commercialBlockers}</strong>
                  <span>bloqueos comerciales</span>
                </div>
                <div
                  className={`${styles.qaCard} ${mediaBlockers > 0 ? styles.warning : ""}`}
                >
                  <strong>{mediaBlockers}</strong>
                  <span>bloqueados por media</span>
                </div>
                <div
                  className={`${styles.qaCard} ${publicationBlockers > 0 ? styles.warning : ""}`}
                >
                  <strong>{publicationBlockers}</strong>
                  <span>no publicados</span>
                </div>
                <div
                  className={`${styles.qaCard} ${unconfirmedOfferCount > 0 ? styles.warning : ""}`}
                >
                  <strong>{unconfirmedOfferCount}</strong>
                  <span>ofertas sin confirmar</span>
                </div>
                <div
                  className={`${styles.qaCard} ${invalidPriceOfferCount > 0 ? styles.warning : ""}`}
                >
                  <strong>{invalidPriceOfferCount}</strong>
                  <span>precios invalidos</span>
                </div>
              </div>
            </section>

            {qaResult.ok ? (
              <section className={styles.panel}>
                <h2>Cobertura de media</h2>
                <div className={styles.qaGrid}>
                  <div
                    className={`${styles.qaCard} ${Number(qaResult.data.products_without_primary_media) > 0 ? styles.warning : ""}`}
                  >
                    <strong>{qaResult.data.products_with_primary_media}</strong>
                    <span>con imagen principal</span>
                  </div>
                  <div
                    className={`${styles.qaCard} ${Number(qaResult.data.products_without_primary_media) > 0 ? styles.warning : ""}`}
                  >
                    <strong>
                      {qaResult.data.products_without_primary_media}
                    </strong>
                    <span>sin imagen principal</span>
                  </div>
                  <div
                    className={`${styles.qaCard} ${Number(qaResult.data.products_without_media) > 0 ? styles.warning : ""}`}
                  >
                    <strong>{qaResult.data.products_without_media}</strong>
                    <span>sin media alguna</span>
                  </div>
                  <div className={styles.qaCard}>
                    <strong>{qaResult.data.total_active_media}</strong>
                    <span>media activa total</span>
                  </div>
                </div>
              </section>
            ) : null}

            <section className={styles.panel}>
              <h2>Bloqueadores ({blockerTotal})</h2>
              <form method="get" className={styles.facts}>
                <input
                  type="text"
                  name="q"
                  defaultValue={searchQuery}
                  placeholder="Buscar producto..."
                  className={styles.filterInput}
                />
                <select
                  name="blocker"
                  defaultValue={blockerQuery}
                  className={styles.filterInput}
                >
                  <option value="">Todos los bloqueos</option>
                  {Object.entries(BLOCKER_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
                <button type="submit" className={styles.filterButton}>
                  Filtrar
                </button>
                {(searchQuery || blockerQuery) && (
                  <Link
                    href="/admin/import/publicacion"
                    className={styles.filterButton}
                  >
                    Limpiar
                  </Link>
                )}
              </form>

              {blockerTotal === 0 ? (
                <p className={styles.help}>
                  No hay bloqueadores. Todos los productos estan listos.
                </p>
              ) : (
                <>
                  <table className={styles.blockerTable}>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Presentacion</th>
                        <th>Problema</th>
                        <th>Accion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blockers.map((b, i) => (
                        <tr key={`${b.product_id}-${b.blocker_code}-${b.offer_id ?? "null"}-${i}`}>
                          <td>
                            <Link
                              href={`/admin/import/productos/${b.product_id}`}
                            >
                              {b.product_name}
                            </Link>
                            {b.brand ? (
                              <span className={styles.help}> ({b.brand})</span>
                            ) : null}
                          </td>
                          <td>{b.presentation_label ?? "-"}</td>
                          <td>{b.blocker_label}</td>
                          <td>
                            <Link
                              href={`/admin/import/productos/${b.product_id}`}
                            >
                              Editar
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {totalPages > 1 && (
                    <nav className={styles.facts}>
                      {page > 1 && (
                        <Link
                          href={`/admin/import/publicacion?page=${page - 1}${blockerQuery ? `&blocker=${blockerQuery}` : ""}${searchQuery ? `&q=${searchQuery}` : ""}`}
                        >
                          Anterior
                        </Link>
                      )}
                      <span>
                        Pagina {page} de {totalPages}
                      </span>
                      {page < totalPages && (
                        <Link
                          href={`/admin/import/publicacion?page=${page + 1}${blockerQuery ? `&blocker=${blockerQuery}` : ""}${searchQuery ? `&q=${searchQuery}` : ""}`}
                        >
                          Siguiente
                        </Link>
                      )}
                    </nav>
                  )}
                </>
              )}
            </section>

            <section className={styles.panel}>
              <h2>Acciones</h2>
              <p className={styles.help}>
                Esta pantalla muestra el estado de preparacion. No ejecuta
                publicaciones automaticas. Para publicar productos, editalos
                individualmente desde{" "}
                <Link href="/admin/import/productos">Productos</Link>. Para
                abrir el consolidado, ve a{" "}
                <Link href="/admin/import/consolidados">Consolidados</Link>.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
