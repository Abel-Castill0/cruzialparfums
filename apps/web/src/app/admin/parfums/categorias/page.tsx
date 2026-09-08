import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsCategoriesRepository } from "@/domains/admin-parfums/categories-repository";
import {
  isCategoryKind,
  isCategoryPublicationStatus,
  type CategoryPublicationStatus,
} from "@/domains/admin-parfums/category-schema";
import { CategoryFilters } from "./category-filters";
import styles from "../productos/page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Categorías" };
const PAGE_SIZE = 20;

function publication(value: unknown): CategoryPublicationStatus | "archived" | undefined {
  if (value === "archived") return value;
  return isCategoryPublicationStatus(value) ? value : undefined;
}

function kindLabel(kind: string): string {
  return kind === "olfactory_family" ? "Familia olfativa" : "Tipo comercial";
}

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminSession();
  if (session.status === "not_configured" || session.status === "unavailable" || session.status === "no_membership") redirect("/admin");
  if (session.status === "signed_out") redirect("/admin/login");
  const membership = session.session.memberships.find((candidate) => candidate.businessUnitCode === "parfums");
  if (!membership) redirect("/admin");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin");

  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const publicationStatus = publication(params.publication);
  const kind = isCategoryKind(params.kind) ? params.kind : undefined;
  const includeArchived = params.archived === "1" || publicationStatus === "archived";
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : "1") || 1);
  const repository = new AdminParfumsCategoriesRepository(supabase, membership.businessUnitId);
  const result = await repository.list(
    {
      search,
      includeArchived,
      ...(publicationStatus ? { publicationStatus } : {}),
      ...(kind ? { kind } : {}),
    },
    { page, pageSize: PAGE_SIZE },
  );

  if (!result.ok) {
    return <div className={styles.page}><main><p className={styles.notice} role="alert">No se pudieron cargar las categorías. Intenta de nuevo.</p></main></div>;
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
  const noFilters = !search && !publicationStatus && !kind && !includeArchived;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/parfums" className={styles.back}>← Cruzial Parfums</Link>
          <h1>Categorías</h1>
          <p>{total} categoría{total === 1 ? "" : "s"} en esta vista.</p>
        </div>
        {membership.role === "admin" ? <Link href="/admin/parfums/categorias/nueva" className={styles.createLink}>+ Nueva categoría</Link> : null}
      </header>
      <main>
        <CategoryFilters initial={{ search, publicationStatus, kind, includeArchived }} />
        {items.length === 0 ? (
          <p className={styles.empty}>{noFilters ? "Aún no hay categorías." : "No hay categorías que coincidan con estos filtros."}</p>
        ) : (
          <>
            <ul className={styles.list} aria-label="Lista de categorías">
              {items.map((category) => (
                <li key={category.id} className={styles.row}>
                  <Link href={`/admin/parfums/categorias/${category.id}`} className={styles.rowLink}>
                    <div className={styles.rowMain}>
                      <strong>{category.parent_id ? "└── " : ""}{category.name}</strong>
                      <span className={styles.rowMeta}>
                        {category.parent_name ? `${category.parent_name} › ${category.name}` : "Categoría raíz"} · {category.slug}
                      </span>
                    </div>
                    <div className={styles.rowBadges}>
                      <span className={`${styles.badge} ${styles[`status-${category.publication_status}`] ?? ""}`}>{category.publication_status}</span>
                      <span className={styles.badge}>{kindLabel(category.kind)}</span>
                      {category.archived_at ? <span className={styles.badgeArchived}>Archivada</span> : null}
                    </div>
                    <div className={styles.rowStats}>
                      <span>{category.product_count} producto{category.product_count === 1 ? "" : "s"}</span>
                      <span>{category.active_child_count} hija{category.active_child_count === 1 ? " activa" : "s activas"}</span>
                      <span>Orden {category.sort_order}</span>
                      <span>Actualizada {new Date(category.updated_at).toLocaleDateString("es-PE")}</span>
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
