import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, EmptyState, FilterTabs, Notice, Pagination, StatusBadge } from "@/components/admin/admin-ui";
import { AdminImportCustomersRepository } from "@/domains/admin-import/customers-repository";
import { CUSTOMER_STATUS_TABS, customerListHref, customerStatusPresentation } from "@/domains/admin-import/customer-presentation";
import { formatLimaDateTime, formatRelativeLima } from "@/domains/admin/order-presentation";
import { CustomerFilters } from "./customer-filters";
import styles from "@/components/admin/catalog-workspace.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Clientes Import" };

const PAGE_SIZE = 20;
const BASE_PATH = "/admin/import/clientes";

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
  if (result.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (result.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "import",
  );
  if (!membership) redirect("/admin");
  const isAdmin = membership.role === "admin";

  const header = (
    <AdminPageHeader
      eyebrow="Cruzial Import"
      title="Clientes"
      description="Verifica a tus clientes para que cada pedido use el depósito correcto."
      meta={isAdmin ? undefined : "Acceso de solo lectura: puedes consultar clientes, pero no modificarlos."}
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
  const search = typeof params.q === "string" ? params.q : "";
  const statusParam = typeof params.status === "string" ? params.status : "";
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const archived = params.archived === "archived" || params.archived === "all" ? params.archived : "active";

  const repository = new AdminImportCustomersRepository(supabase, membership.businessUnitId);
  const [listResult, pendingCount] = await Promise.all([
    repository.list({ search, status: statusParam || undefined, archived }, { page, pageSize: PAGE_SIZE }),
    repository.countPendingVerification(),
  ]);

  const tabs = CUSTOMER_STATUS_TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    href: customerListHref(BASE_PATH, { q: search, archived }, tab.status),
    current: statusParam === tab.status,
    ...(tab.key === "pending" ? { count: pendingCount, tone: "attention" as const } : {}),
  }));
  const now = new Date();

  return (
    <AdminPage>
      {header}

      {pendingCount !== null && pendingCount > 0 && statusParam !== "pending_verification" ? (
        <Notice tone="attention" title={`${pendingCount} ${pendingCount === 1 ? "cliente espera" : "clientes esperan"} verificación`}>
          Mientras estén pendientes, sus pedidos usan la política de depósito de cliente nuevo.
        </Notice>
      ) : null}

      <div className={styles.toolbar}>
        <FilterTabs tabs={tabs} label="Ver clientes por estado" />
        <CustomerFilters initial={{ search, status: statusParam, archived }} />
      </div>

      {!listResult.ok ? (
        <Notice tone="danger" title="No pudimos cargar los clientes">Recarga la página. No asumas que no hay clientes.</Notice>
      ) : listResult.data.items.length === 0 ? (
        <EmptyState
          title={
            statusParam === "pending_verification" && !search
              ? "No hay clientes pendientes de verificar."
              : search
                ? "No hay clientes que coincidan con esta búsqueda."
                : "No hay clientes en esta vista."
          }
        />
      ) : (
        <>
          <p className={styles.muted} aria-live="polite">
            {listResult.data.total} {listResult.data.total === 1 ? "cliente" : "clientes"} en esta vista.
          </p>
          <ul className={styles.list} aria-label="Lista de clientes">
            {listResult.data.items.map((customer) => {
              const status = customerStatusPresentation(customer.verifiedCustomerStatus);
              return (
                <li key={customer.id}>
                  <Link href={`${BASE_PATH}/${customer.id}` as Route} className={`${styles.row} ${styles.rowNoThumb}`}>
                    <span className={styles.identity}>
                      <strong className={styles.name}>{customer.fullName}</strong>
                      <span className={styles.muted}>{customer.phone || "Sin teléfono"}</span>
                    </span>
                    <span className={styles.state}>
                      <span className={styles.badges}>
                        <StatusBadge tone={customer.archivedAt ? "neutral" : status.tone}>{status.label}</StatusBadge>
                        {customer.archivedAt ? <StatusBadge tone="neutral">Archivado</StatusBadge> : null}
                      </span>
                      <span className={styles.muted}>{status.description}</span>
                    </span>
                    <span className={styles.figures}>
                      <span title={formatLimaDateTime(customer.createdAt)}>Registrado {formatRelativeLima(customer.createdAt, now).toLowerCase()}</span>
                      {customer.verifiedAt ? <span title={formatLimaDateTime(customer.verifiedAt)}>Verificado {formatRelativeLima(customer.verifiedAt, now).toLowerCase()}</span> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil(listResult.data.total / listResult.data.pageSize))}
            hrefFor={(next) => {
              const query = new URLSearchParams();
              for (const [key, value] of Object.entries(params)) if (typeof value === "string") query.set(key, value);
              query.set("page", String(next));
              return `${BASE_PATH}?${query.toString()}`;
            }}
          />
        </>
      )}
    </AdminPage>
  );
}
