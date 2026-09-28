import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ActionLink,
  AdminPage,
  AdminPageHeader,
  EmptyState,
  FilterTabs,
  Notice,
  Pagination,
  StatusBadge,
} from "@/components/admin/admin-ui";
import { AdminParfumsProductsRepository } from "@/domains/admin-parfums/products-repository";
import type {
  AvailabilityStatus,
  ProductionStatus,
  PublicationStatus,
} from "@/domains/admin-parfums/product-schema";
import { PRODUCT_STATUS_LABELS, PRODUCT_AVAILABILITY_LABELS } from "@/domains/admin-parfums/product-schema";
import { PARFUMS_LIST_VIEWS, currentParfumsView, parfumsViewHref } from "@/domains/admin-parfums/product-presentation";
import { formatRelativeLima } from "@/domains/admin/order-presentation";
import { ProductFilters } from "./product-filters";
import styles from "@/components/admin/catalog-workspace.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Productos" };

const PAGE_SIZE = 20;
const BASE_PATH = "/admin/parfums/productos";

function isPublicationStatus(value: string | undefined): value is PublicationStatus {
  return value === "draft" || value === "published" || value === "archived";
}

function isProductionStatus(value: string | undefined): value is ProductionStatus {
  return value === "active" || value === "discontinued";
}

function isAvailabilityStatus(value: string | undefined): value is AvailabilityStatus {
  return value === "available" || value === "out_of_stock";
}

export default async function AdminParfumsProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const result = await getAdminSession();
  if (result.status === "not_configured") redirect("/admin");
  if (result.status === "unavailable") redirect("/admin");
  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "no_membership") redirect("/admin");
  if (result.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (result.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "parfums",
  );
  if (!membership) redirect("/admin");
  const isAdmin = membership.role === "admin";

  const header = (
    <AdminPageHeader
      eyebrow="Cruzial Parfums"
      title="Productos"
      description="Administra lo que aparece y se vende en Cruzial Parfums."
      meta={isAdmin ? undefined : "Acceso de solo lectura: puedes consultar los productos, pero no modificarlos."}
      actions={isAdmin ? <ActionLink href="/admin/parfums/productos/nuevo" variant="primary">Agregar producto</ActionLink> : undefined}
    />
  );

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <AdminPage>
        {header}
        <Notice tone="danger" title="El backend de administración no está configurado en este entorno." />
      </AdminPage>
    );
  }

  const params = await searchParams;
  const stringParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") stringParams[key] = value;
  const search = stringParams.q ?? "";
  const publicationStatus = isPublicationStatus(stringParams.publication) ? stringParams.publication : undefined;
  const productionStatus = isProductionStatus(stringParams.production) ? stringParams.production : undefined;
  const availabilityStatus = isAvailabilityStatus(stringParams.availability) ? stringParams.availability : undefined;
  const featuredOnly = stringParams.featured === "1";
  const includeArchived = stringParams.archived === "1";
  const page = Math.max(1, Number(stringParams.page) || 1);

  const repository = new AdminParfumsProductsRepository(supabase, membership.businessUnitId);
  const [listResult, counts] = await Promise.all([
    repository.list(
      {
        search,
        featuredOnly,
        includeArchived,
        ...(publicationStatus ? { publicationStatus } : {}),
        ...(productionStatus ? { productionStatus } : {}),
        ...(availabilityStatus ? { availabilityStatus } : {}),
      },
      { page, pageSize: PAGE_SIZE },
    ),
    repository.countByView(),
  ]);

  const currentView = currentParfumsView(stringParams);
  const viewCount: Record<string, number | null> = {
    published: counts?.published ?? null,
    draft: counts?.draft ?? null,
    out_of_stock: counts?.outOfStock ?? null,
    archived: counts?.archived ?? null,
  };
  const tabs = PARFUMS_LIST_VIEWS.map((view) => ({
    key: view.key,
    label: view.label,
    href: parfumsViewHref(BASE_PATH, stringParams, view),
    count: viewCount[view.key] ?? null,
    current: currentView === view.key,
    ...(view.key === "out_of_stock" ? { tone: "attention" as const } : {}),
  }));
  const filtered = Boolean(search || productionStatus || featuredOnly || (currentView === null && (publicationStatus || availabilityStatus || includeArchived)));
  const now = new Date();

  return (
    <AdminPage>
      {header}

      <div className={styles.toolbar}>
        <FilterTabs tabs={tabs} label="Ver productos por estado" />
        <ProductFilters
          initial={{ search, publicationStatus, productionStatus, availabilityStatus, featuredOnly, includeArchived }}
        />
      </div>

      {!listResult.ok ? (
        <Notice tone="danger" title="No pudimos cargar el catálogo">
          Recarga la página. No asumas que el catálogo está vacío.
        </Notice>
      ) : listResult.data.items.length === 0 ? (
        <EmptyState title={filtered || currentView !== "all" ? "No hay productos en esta vista." : "Todavía no hay productos."}>
          {filtered ? "Prueba con otra búsqueda o quita filtros en “Más filtros”." : isAdmin && currentView === "all" ? "Agrega el primero con “Agregar producto”." : null}
        </EmptyState>
      ) : (
        <>
          <p className={styles.muted} aria-live="polite">
            {listResult.data.total} {listResult.data.total === 1 ? "producto" : "productos"} en esta vista.
            {counts === null ? " No pudimos verificar los totales por estado." : ""}
          </p>
          <ul className={styles.list} aria-label="Lista de productos">
            {listResult.data.items.map((product) => {
              const publication = product.publication_status as PublicationStatus;
              const archived = product.archived_at !== null || publication === "archived";
              const outOfStock = product.availability_status === "out_of_stock";
              return (
                <li key={product.id}>
                  <Link href={`${BASE_PATH}/${product.id}` as Route} className={styles.row}>
                    {product.primary_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail from the existing media URL
                      <img className={styles.thumb} src={product.primary_image_url} alt="" loading="lazy" width={56} height={56} />
                    ) : (
                      <span className={styles.thumb} aria-hidden="true">Sin foto</span>
                    )}
                    <span className={styles.identity}>
                      <strong className={styles.name}>{product.name}</strong>
                      <span className={styles.muted}>
                        {product.brand ?? "Sin marca"}
                        {!product.primary_image_url ? " · Sin foto principal" : ""}
                      </span>
                    </span>
                    <span className={styles.state}>
                      <span className={styles.badges}>
                        <StatusBadge tone={archived ? "neutral" : publication === "published" ? "healthy" : "attention"}>
                          {PRODUCT_STATUS_LABELS[publication] ?? "Estado desconocido"}
                        </StatusBadge>
                        {!archived ? (
                          <StatusBadge tone={outOfStock ? "attention" : "neutral"}>
                            {PRODUCT_AVAILABILITY_LABELS[product.availability_status as AvailabilityStatus] ?? "Disponibilidad desconocida"}
                          </StatusBadge>
                        ) : null}
                        {product.production_status === "discontinued" ? <StatusBadge tone="neutral">Descontinuado</StatusBadge> : null}
                        {product.is_featured ? <StatusBadge tone="neutral">Destacado</StatusBadge> : null}
                      </span>
                      {product.variant_count === 0 && !archived ? (
                        <span className={styles.muted}>Sin presentaciones</span>
                      ) : null}
                    </span>
                    <span className={styles.figures}>
                      <span>{product.variant_count} {product.variant_count === 1 ? "presentación" : "presentaciones"}</span>
                      <span>Actualizado {formatRelativeLima(product.updated_at, now).toLowerCase()}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil(listResult.data.total / listResult.data.pageSize))}
            hrefFor={(next) => `${BASE_PATH}?${new URLSearchParams({ ...stringParams, page: String(next) }).toString()}`}
          />
        </>
      )}
    </AdminPage>
  );
}
