import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminImportOrdersRepository } from "@/domains/admin-import/orders-repository";
import { importOrderStatusLabel } from "@/domains/admin-import/import-status";
import { OrderFilters } from "./order-filters";
import styles from "../productos/page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pedidos Import" };

const PAGE_SIZE = 20;

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(amount);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusBadgeClass(status: string): string {
  if (status === "confirmed") return [styles.badge, styles["status-published"]].filter(Boolean).join(" ");
  if (status === "cancelled") return [styles.badge, styles["status-archived"]].filter(Boolean).join(" ");
  return styles.badge ?? "";
}

export default async function AdminImportOrdersPage({
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

  const repository = new AdminImportOrdersRepository(supabase, membership.businessUnitId);
  const listResult = await repository.list(
    { search, status: statusParam || undefined },
    { page, pageSize: PAGE_SIZE },
  );

  if (!listResult.ok) {
    return (
      <div className={styles.page}>
        <main>
          <p className={styles.notice} role="alert">
            No se pudieron cargar los pedidos. Intenta de nuevo.
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
          <h1>Pedidos</h1>
          <p>{total} solicitud{total === 1 ? "" : "es"} registrada{total === 1 ? "" : "s"}.</p>
        </div>
      </header>

      <main>
        <OrderFilters initial={{ search, status: statusParam }} />

        {items.length === 0 ? (
          <p className={styles.empty}>
            No hay pedidos que coincidan con esta búsqueda.
          </p>
        ) : (
          <>
            <ul className={styles.list} aria-label="Lista de pedidos">
              {items.map((order) => (
                <li key={order.id} className={styles.row}>
                  <Link href={`/admin/import/pedidos/${order.id}` as Route} className={styles.rowLink}>
                    <div className={styles.rowMain}>
                      <strong>{order.orderNumber}</strong>
                      <span className={styles.rowMeta}>
                        {order.customer.name || "Sin nombre"} · {order.customer.phone || "Sin teléfono"}
                        {order.delivery.district ? ` · ${order.delivery.district}` : ""}
                      </span>
                    </div>
                    <div className={styles.rowBadges}>
                      <span className={statusBadgeClass(order.status)}>
                        {importOrderStatusLabel(order.status)}
                      </span>
                      {order.campaignNumber ? (
                        <span className={styles.badge}>Campaña #{order.campaignNumber}</span>
                      ) : null}
                    </div>
                    <div className={styles.rowStats}>
                      <span>{formatDateTime(order.createdAt)}</span>
                      <span>{order.lineCount} línea{order.lineCount === 1 ? "" : "s"}</span>
                      <span>{money(order.subtotalAmount, order.currency)}</span>
                      {order.depositPercentageSnapshot != null ? (
                        <span>Depósito: {order.depositPercentageSnapshot}%</span>
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
