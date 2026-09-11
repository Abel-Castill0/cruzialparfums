import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminImportCustomersRepository } from "@/domains/admin-import/customers-repository";
import { importCustomerStatusLabel } from "@/domains/admin-import/import-status";
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
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminImportCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidUuid(id)) notFound();

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

  const repository = new AdminImportCustomersRepository(supabase, membership.businessUnitId);
  const detailResult = await repository.getById(id);

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
            {customer.verifiedCustomerStatus === "returning" ? (
              <> Actualmente: <strong>70% de depósito</strong> (cliente recurrente verificado).</>
            ) : (
              <> Actualmente: <strong>50% de depósito</strong> (cliente nuevo o pendiente).</>
            )}
          </p>
        </section>
      </main>
    </div>
  );
}
