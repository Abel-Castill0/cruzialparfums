import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminImportCustomersRepository } from "@/domains/admin-import/customers-repository";
import { importCustomerStatusLabel } from "@/domains/admin-import/import-status";
import { CustomerFilters } from "./customer-filters";
import styles from "../productos/page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Clientes Import" };

const PAGE_SIZE = 20;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium" });
}

function statusBadgeClass(status: string): string {
  if (status === "returning") return [styles.badge, styles["status-published"]].filter(Boolean).join(" ");
  if (status === "pending_verification") return [styles.badge, styles["status-draft"]].filter(Boolean).join(" ");
  return styles.badge ?? "";
}

export default async function AdminImportCustomersPage({
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
    (candidate) => candidate.businessUnitCode === "import",
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
  const statusParam = typeof params.status === "string" ? params.status : "";
  const page = Math.max(1, Number(params.page) || 1);

  const repository = new AdminImportCustomersRepository(supabase, membership.businessUnitId);
  const listResult = await repository.list(
    { search, status: statusParam || undefined },
    { page, pageSize: PAGE_SIZE },
  );

  if (!listResult.ok) {
    return (
      <div className={styles.page}>
        <main>
          <p className={styles.notice} role="alert">
            No se pudieron cargar los clientes. Intenta de nuevo.
          </p>
        </main>
      </div>
    );
  }

  const { items, total, pageSize } = listResult.data;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/import" className={styles.back}>
            ← Cruzial Import
          </Link>
          <h1>Clientes</h1>
          <p>{total} cliente{total === 1 ? "" : "s"} registrado{total === 1 ? "" : "s"}.</p>
        </div>
      </header>

      <main>
        <CustomerFilters initial={{ search, status: statusParam }} />

        {items.length === 0 ? (
          <p className={styles.empty}>
            No hay clientes que coincidan con esta búsqueda.
          </p>
        ) : (
          <>
            <ul className={styles.list} aria-label="Lista de clientes">
              {items.map((customer) => (
                <li key={customer.id} className={styles.row}>
                  <Link href={`/admin/import/clientes/${customer.id}` as Route} className={styles.rowLink}>
                    <div className={styles.rowMain}>
                      <strong>{customer.fullName}</strong>
                      <span className={styles.rowMeta}>
                        {customer.phone || "Sin teléfono"}
                        {customer.archivedAt ? " · Archivado" : ""}
                      </span>
                    </div>
                    <div className={styles.rowBadges}>
                      <span className={statusBadgeClass(customer.verifiedCustomerStatus)}>
                        {importCustomerStatusLabel(customer.verifiedCustomerStatus)}
                      </span>
                    </div>
                    <div className={styles.rowStats}>
                      <span>Creado: {formatDate(customer.createdAt)}</span>
                      {customer.verifiedAt ? (
                        <span>Verificado: {formatDate(customer.verifiedAt)}</span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {totalPages > 1 ? (
              <nav className={styles.pagination} aria-label="Paginación">
                {page > 1 ? (
                  <Link href={`?${new URLSearchParams({ ...(params as Record<string, string>), page: String(page - 1) }).toString()}` as Route}>
                    ← Anterior
                  </Link>
                ) : (
                  <span aria-disabled="true">← Anterior</span>
                )}
                <span>Página {page} de {totalPages}</span>
                {page < totalPages ? (
                  <Link href={`?${new URLSearchParams({ ...(params as Record<string, string>), page: String(page + 1) }).toString()}` as Route}>
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
