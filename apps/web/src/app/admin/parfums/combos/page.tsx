import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsCombosRepository } from "@/domains/admin-parfums/combos-repository";
import { isVerificationStatus, VERIFICATION_STATUS_LABELS } from "@/domains/admin-parfums/combo-schema";
import { ComboFilters } from "./combo-filters";
import styles from "../productos/page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Combos" };
const PAGE_SIZE = 20;

export default async function CombosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminSession();
  if (session.status === "not_configured" || session.status === "unavailable" || session.status === "no_membership") {
    redirect("/admin");
  }
  if (session.status === "signed_out") redirect("/admin/login");
  const membership = session.session.memberships.find((candidate) => candidate.businessUnitCode === "parfums");
  if (!membership) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className={styles.page}>
        <main>
          <p className={styles.notice}>El backend de administración no está configurado en este entorno.</p>
        </main>
      </div>
    );
  }

  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const verificationStatus = isVerificationStatus(params.verification) ? params.verification : undefined;
  const includeArchived = params.archived === "1";
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : "1") || 1);

  const repository = new AdminParfumsCombosRepository(supabase, membership.businessUnitId);
  const result = await repository.list(
    {
      search,
      includeArchived,
      ...(verificationStatus ? { verificationStatus } : {}),
    },
    { page, pageSize: PAGE_SIZE },
  );

  if (!result.ok) {
    return (
      <div className={styles.page}>
        <main>
          <p className={styles.notice} role="alert">No se pudieron cargar los combos. Intenta de nuevo.</p>
        </main>
      </div>
    );
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
  const noFilters = !search && !verificationStatus && !includeArchived;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/parfums" className={styles.back}>← Cruzial Parfums</Link>
          <h1>Combos</h1>
          <p>{total} combo{total === 1 ? "" : "s"} en esta vista.</p>
        </div>
        {membership.role === "admin" ? (
          <Link href="/admin/parfums/combos/nuevo" className={styles.createLink}>+ Nuevo combo</Link>
        ) : null}
      </header>
      <main>
        <ComboFilters initial={{ search, verificationStatus, includeArchived }} />
        {items.length === 0 ? (
          <p className={styles.empty}>
            {noFilters
              ? "Aún no hay combos. Crea uno sobre un producto Parfums existente."
              : "No hay combos que coincidan con estos filtros."}
          </p>
        ) : (
          <>
            <ul className={styles.list} aria-label="Lista de combos">
              {items.map((combo) => (
                <li key={combo.id} className={styles.row}>
                  <Link href={`/admin/parfums/combos/${combo.id}`} className={styles.rowLink}>
                    <div className={styles.rowMain}>
                      <strong>{combo.product_name}</strong>
                      <span className={styles.rowMeta}>
                        {combo.product_brand ? `${combo.product_brand} · ` : ""}{combo.product_slug}
                      </span>
                    </div>
                    <div className={styles.rowBadges}>
                      <span className={`${styles.badge} ${styles[`status-${combo.product_publication_status}`] ?? ""}`}>
                        {combo.product_publication_status}
                      </span>
                      <span className={styles.badge}>
                        {VERIFICATION_STATUS_LABELS[combo.composition_verification_status as keyof typeof VERIFICATION_STATUS_LABELS]
                          ?? combo.composition_verification_status}
                      </span>
                      {combo.archived_at ? <span className={styles.badgeArchived}>Archivado</span> : null}
                    </div>
                    <div className={styles.rowStats}>
                      <span>{combo.item_count} ítem{combo.item_count === 1 ? "" : "s"}</span>
                      <span>Actualizado {new Date(combo.updated_at).toLocaleDateString("es-PE")}</span>
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
