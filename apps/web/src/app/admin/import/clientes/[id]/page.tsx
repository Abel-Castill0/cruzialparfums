import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminImportCustomersRepository } from "@/domains/admin-import/customers-repository";
import { importCustomerStatusLabel, importOrderStatusLabel } from "@/domains/admin-import/import-status";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";
import { CustomerEditForm } from "./customer-edit-form";
import { CustomerStatusControls } from "./customer-status-controls";
import { CustomerArchiveButton } from "./customer-archive-button";
import styles from "../../productos/page.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: isValidUuid(id) ? "Cliente Import" : "Clientes Import" };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" });
}

export default async function AdminImportCustomerDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isValidUuid(id)) notFound();

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

  const repository = new AdminImportCustomersRepository(supabase, membership.businessUnitId);
  const query = await searchParams;
  const [detailResult, depositPercentages, history] = await Promise.all([
    repository.getById(id),
    repository.getActiveDepositPercentages(),
    repository.orderHistory(id, Number(query.page) || 1),
  ]);

  if (!detailResult.ok) {
    if (detailResult.error.type === "not_found") notFound();
    return (
      <div className={styles.page}>
        <main>
          <p className={styles.notice} role="alert">No se pudo cargar el cliente.</p>
        </main>
      </div>
    );
  }

  const customer = detailResult.data;
  const summary = history.ok && history.data.summary && typeof history.data.summary === "object" && !Array.isArray(history.data.summary) ? history.data.summary : {};
  const values = Array.isArray(summary.fulfilled_value_by_currency) ? summary.fulfilled_value_by_currency.filter((v):v is { [key:string]:import("@/lib/supabase/database.types").Json } => v!==null&&typeof v==="object"&&!Array.isArray(v)) : [];
  const isAdmin = membership.role === "admin";
  const isArchived = customer.archivedAt !== null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href={"/admin/import/clientes" as Route} className={styles.back}>← Clientes</Link>
          <h1>{customer.fullName}</h1>
          <p>
            <span className={styles.badge}>{importCustomerStatusLabel(customer.verifiedCustomerStatus)}</span>
            {isArchived ? <span className={`${styles.badge} ${styles["status-archived"]}`} style={{ marginLeft: 8 }}>Archivado</span> : null}
          </p>
        </div>
      </header>

      <main className={styles.formWrapper}>
        <section className={styles.section} aria-labelledby="detail-heading">
          <div className={styles.sectionTitle}>
            <h2 id="detail-heading">Datos del cliente</h2>
          </div>
          <dl className={styles.detailList}>
            <div><dt>Nombre</dt><dd>{customer.fullName}</dd></div>
            <div><dt>Teléfono</dt><dd>{customer.phone || "—"}</dd></div>
            <div><dt>Email</dt><dd>{customer.email || "—"}</dd></div>
            <div><dt>Documento</dt><dd>{customer.documentId || "—"}</dd></div>
            <div><dt>Notas</dt><dd>{customer.notes || "—"}</dd></div>
            <div><dt>Creado</dt><dd>{formatDate(customer.createdAt)}</dd></div>
            <div><dt>Última actualización</dt><dd>{formatDate(customer.updatedAt)}</dd></div>
            {customer.verifiedAt ? (
              <div><dt>Verificado</dt><dd>{formatDate(customer.verifiedAt)}</dd></div>
            ) : null}
            <div><dt>Estado verificado</dt><dd>{importCustomerStatusLabel(customer.verifiedCustomerStatus)}</dd></div>
          </dl>
        </section>

        <section className={styles.panel} aria-labelledby="history-heading">
          <h2 id="history-heading">Historial de pedidos</h2>
          {!history.ok ? <p role="alert">No se pudo cargar el historial. Recarga para volver a intentarlo.</p> : <>
            <p>{history.data.total} pedido{history.data.total === 1 ? "" : "s"} · {history.data.completed} completado{history.data.completed === 1 ? "" : "s"}</p>
            <p>Pendientes por confirmar: {Number(summary.pending??0)}. Valor de pedidos cumplidos: {values.map(v=>`${v.currency} ${v.amount}`).join(" · ")||"sin pedidos cumplidos"}.</p>
            <p>Este historial muestra pedidos vinculados a este cliente. No cambia automáticamente su estado ni las condiciones de pedidos anteriores.</p>
            {history.data.latest ? <p>Último pedido: <Link href={`/admin/import/pedidos/${history.data.latest.id}` as Route}>{history.data.latest.order_number}</Link> · {formatDate(history.data.latest.created_at)}</p> : <p>Aún no hay pedidos vinculados.</p>}
            <ul className={styles.list}>
              {history.data.items.map(order => <li key={order.id} className={styles.row}>
                <Link href={`/admin/import/pedidos/${order.id}` as Route}>
                  <strong>{order.order_number}</strong> · {importOrderStatusLabel(order.status)}
                  <p>{formatDate(order.created_at)} · {order.currency} {order.subtotal_amount.toFixed(2)}</p>
                </Link>
              </li>)}
            </ul>
            {history.data.total > history.data.pageSize ? <nav className={styles.pagination} aria-label="Paginación del historial">
              {history.data.page > 1 ? <Link href={`?page=${history.data.page - 1}` as Route}>Anterior</Link> : null}
              <span>Página {history.data.page}</span>
              {history.data.page * history.data.pageSize < history.data.total ? <Link href={`?page=${history.data.page + 1}` as Route}>Siguiente</Link> : null}
            </nav> : null}
          </>}
        </section>

        {isAdmin && !isArchived ? (
          <CustomerEditForm
            customerId={customer.id}
            initialFullName={customer.fullName}
            initialPhone={customer.phone}
            initialNotes={customer.notes}
          />
        ) : null}

        {isAdmin && !isArchived ? (
          <CustomerStatusControls
            customerId={customer.id}
            currentStatus={customer.verifiedCustomerStatus}
            depositPercentages={depositPercentages}
          />
        ) : null}

        {isAdmin && !isArchived ? (
          <CustomerArchiveButton customerId={customer.id} customerName={customer.fullName} />
        ) : null}

        <section className={styles.section} aria-labelledby="snapshot-heading">
          <div className={styles.sectionTitle}>
            <h2 id="snapshot-heading">Contrato de depósito</h2>
          </div>
          <p style={{ fontSize: 13, color: "#5c574f" }}>
            El estado verificado del cliente determina la política de depósito en futuras compras.
            {(() => {
              const activeStatus = customer.verifiedCustomerStatus === "returning" ? "returning" : "new";
              const pct = activeStatus === "returning" ? depositPercentages.returning : depositPercentages.new;
              if (pct === null) {
                return <> No hay una política de depósito activa configurada para este estado — configúrala antes de generar nuevos pedidos.</>;
              }
              return (
                <>
                  {" "}Actualmente: <strong>{pct}% de depósito</strong> ({activeStatus === "returning" ? "cliente recurrente verificado" : "cliente nuevo o pendiente"}).
                </>
              );
            })()}
          </p>
        </section>
      </main>
    </div>
  );
}
