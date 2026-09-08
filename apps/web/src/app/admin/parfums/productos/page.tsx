import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsProductsRepository } from "@/domains/admin-parfums/products-repository";
import type {
  ProductionStatus,
  PublicationStatus,
} from "@/domains/admin-parfums/product-schema";
import { ProductFilters } from "./product-filters";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Productos" };

const PAGE_SIZE = 20;

function isPublicationStatus(value: string | undefined): value is PublicationStatus {
  return value === "draft" || value === "published" || value === "archived";
}

function isProductionStatus(value: string | undefined): value is ProductionStatus {
  return value === "active" || value === "discontinued";
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

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "parfums",
  );
  if (!membership) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className={styles.page}>
        <main>
          <p className={styles.notice}>
            El backend de administración no está configurado en este entorno.
          </p>
        </main>
      </div>
    );
  }

  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const publicationStatus = isPublicationStatus(params.publication as string | undefined)
    ? (params.publication as PublicationStatus)
    : undefined;
  const productionStatus = isProductionStatus(params.production as string | undefined)
    ? (params.production as ProductionStatus)
    : undefined;
  const featuredOnly = params.featured === "1";
  const includeArchived = params.archived === "1";
  const page = Math.max(1, Number(params.page) || 1);

  const repository = new AdminParfumsProductsRepository(supabase, membership.businessUnitId);
  const listResult = await repository.list(
    {
      search,
      featuredOnly,
      includeArchived,
      ...(publicationStatus ? { publicationStatus } : {}),
      ...(productionStatus ? { productionStatus } : {}),
    },
    { page, pageSize: PAGE_SIZE },
  );

  if (!listResult.ok) {
    return (
      <div className={styles.page}>
        <main>
          <p className={styles.notice} role="alert">
            No se pudo cargar el catálogo. Intenta de nuevo.
          </p>
        </main>
      </div>
    );
  }

  const { items, total, pageSize } = listResult.data;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const role = membership.role;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/parfums" className={styles.back}>
            ← Cruzial Parfums
          </Link>
          <h1>Productos</h1>
          <p>{total} producto{total === 1 ? "" : "s"} en total.</p>
        </div>
        {role === "admin" ? (
          <Link href="/admin/parfums/productos/nuevo" className={styles.createLink}>
            + Nuevo producto
          </Link>
        ) : null}
      </header>

      <main>
      <ProductFilters
        initial={{ search, publicationStatus, productionStatus, featuredOnly, includeArchived }}
      />

      {items.length === 0 ? (
        <p className={styles.empty}>
          No hay productos que coincidan con estos filtros.
        </p>
      ) : (
        <>
          <ul className={styles.list} aria-label="Lista de productos">
            {items.map((product) => (
              <li key={product.id} className={styles.row}>
                <Link href={`/admin/parfums/productos/${product.id}`} className={styles.rowLink}>
                  <div className={styles.rowMain}>
                    <strong>{product.name}</strong>
                    <span className={styles.rowMeta}>
                      {product.brand ?? "Sin marca"} · {product.slug}
                    </span>
                  </div>
                  <div className={styles.rowBadges}>
                    <span className={`${styles.badge} ${styles[`status-${product.publication_status}`] ?? ""}`}>
                      {product.publication_status}
                    </span>
                    <span className={styles.badge}>{product.production_status}</span>
                    <span className={styles.badge}>{product.availability_status}</span>
                    {product.is_featured ? <span className={styles.badgeFeatured}>★ Destacado</span> : null}
                    {product.archived_at ? <span className={styles.badgeArchived}>Archivado</span> : null}
                  </div>
                  <div className={styles.rowStats}>
                    <span>{product.variant_count} variante{product.variant_count === 1 ? "" : "s"}</span>
                    <span>Actualizado {new Date(product.updated_at).toLocaleDateString("es-PE")}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {totalPages > 1 ? (
            <nav className={styles.pagination} aria-label="Paginación">
              {page > 1 ? (
                <Link href={`?${new URLSearchParams({ ...params as Record<string, string>, page: String(page - 1) }).toString()}`}>
                  ← Anterior
                </Link>
              ) : (
                <span aria-disabled="true">← Anterior</span>
              )}
              <span>Página {page} de {totalPages}</span>
              {page < totalPages ? (
                <Link href={`?${new URLSearchParams({ ...params as Record<string, string>, page: String(page + 1) }).toString()}`}>
                  Siguiente →
                </Link>
              ) : (
                <span aria-disabled="true">Siguiente →</span>
              )}
            </nav>
          ) : null}
        </>
      )}
      </main>
    </div>
  );
}
