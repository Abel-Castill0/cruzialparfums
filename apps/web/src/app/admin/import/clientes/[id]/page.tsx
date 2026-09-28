import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import {
  ActionLink,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  BackLink,
  Disclosure,
  FactList,
  NextStepCard,
  Notice,
  StatusBadge,
} from "@/components/admin/admin-ui";
import { AdminImportCustomersRepository } from "@/domains/admin-import/customers-repository";
import { importOrderStatusLabel } from "@/domains/admin-import/import-status";
import { customerStatusOptions, customerStatusPresentation, depositConsequence } from "@/domains/admin-import/customer-presentation";
import { formatLimaDateTime, formatMoney } from "@/domains/admin/order-presentation";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";
import { CustomerEditForm } from "./customer-edit-form";
import { CustomerStatusControls } from "./customer-status-controls";
import { CustomerArchiveButton } from "./customer-archive-button";
import styles from "@/components/admin/catalog-workspace.module.css";

export const dynamic = "force-dynamic";

const LIST_HREF = "/admin/import/clientes";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: isValidUuid(id) ? "Cliente Import" : "Clientes Import" };
}

function ProblemPage({ title }: { title: string }) {
  return (
    <AdminPage>
      <div>
        <BackLink href={LIST_HREF}>Clientes</BackLink>
        <AdminPageHeader eyebrow="Cruzial Import · Cliente" title="Cliente" />
      </div>
      <Notice tone="danger" title={title}>Recarga la página. No hagas cambios hasta que el cliente cargue completo.</Notice>
    </AdminPage>
  );
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
  if (!supabase) return <ProblemPage title="El backend de administración no está configurado en este entorno." />;

  const repository = new AdminImportCustomersRepository(supabase, membership.businessUnitId);
  const query = await searchParams;
  const [detailResult, policies, history] = await Promise.all([
    repository.getById(id),
    repository.getActiveDepositPolicyState(),
    repository.orderHistory(id, Number(query.page) || 1),
  ]);

  if (!detailResult.ok) {
    if (detailResult.error.type === "not_found") notFound();
    return <ProblemPage title="No pudimos cargar el cliente." />;
  }

  const customer = detailResult.data;
  const summary = history.ok && history.data.summary && typeof history.data.summary === "object" && !Array.isArray(history.data.summary) ? history.data.summary : {};
  const values = Array.isArray(summary.fulfilled_value_by_currency)
    ? summary.fulfilled_value_by_currency.filter((v): v is { [key: string]: Json } => v !== null && typeof v === "object" && !Array.isArray(v))
    : [];
  const isAdmin = membership.role === "admin";
  const isArchived = customer.archivedAt !== null;
  const status = customerStatusPresentation(customer.verifiedCustomerStatus);
  const deposit = depositConsequence(customer.verifiedCustomerStatus, policies);
  const pending = customer.verifiedCustomerStatus === "pending_verification";

  return (
    <AdminPage width="wide">
      <div>
        <BackLink href={LIST_HREF}>Clientes</BackLink>
        <AdminPageHeader
          eyebrow="Cruzial Import · Cliente"
          title={customer.fullName}
          description={customer.phone || "Sin teléfono"}
          meta={isAdmin ? undefined : "Acceso de solo lectura: puedes consultar este cliente, pero no modificarlo."}
          actions={
            <div className={styles.headerBadges}>
              <StatusBadge tone={isArchived ? "neutral" : status.tone}>{status.label}</StatusBadge>
              {isArchived ? <StatusBadge tone="neutral">Archivado</StatusBadge> : null}
            </div>
          }
        />
      </div>

      {isArchived ? (
        <Notice tone="neutral" title="Cliente archivado">
          Queda como historial: no puede editarse ni cambiar de estado. Sus pedidos se conservan.
        </Notice>
      ) : null}

      <section className={styles.summary} aria-labelledby="customer-status-title">
        <div className={styles.summaryMain}>
          <h2 id="customer-status-title" className={styles.eyebrow}>Verificación y depósito</h2>
          <p className={styles.headline}>{status.description}</p>
          <p className={styles.consequence}><strong>{deposit.title}.</strong> {deposit.detail}</p>
        </div>
        <div className={styles.summaryNext}>
          {!isArchived && pending ? (
            <NextStepCard title="Verificar al cliente" tone="attention">
              <p>Confirma si es un cliente nuevo o recurrente. Hasta entonces, sus pedidos usan la política de cliente nuevo.</p>
              {isAdmin ? <ActionLink href="#estado" variant="primary">Verificar ahora</ActionLink> : null}
            </NextStepCard>
          ) : deposit.tone === "danger" ? (
            <NextStepCard title="Configurar la política de depósito" tone="danger">
              <p>{deposit.detail}</p>
              <ActionLink href="/admin/import/configuracion" variant="primary">Ir a Configuración</ActionLink>
            </NextStepCard>
          ) : (
            <NextStepCard title="Nada pendiente" tone="healthy">
              <p>El cliente está verificado y tiene una política de depósito activa.</p>
            </NextStepCard>
          )}
        </div>
      </section>

      {isAdmin && !isArchived ? (
        <div id="estado" className={styles.anchor}>
          <AdminSection
            id="estado-cliente"
            title="Estado del cliente"
            description="Define qué política de depósito usan sus nuevas solicitudes. Nunca cambia automáticamente."
          >
            <CustomerStatusControls
              customerId={customer.id}
              currentStatus={customer.verifiedCustomerStatus}
              options={customerStatusOptions(policies)}
            />
          </AdminSection>
        </div>
      ) : null}

      <AdminSection id="contacto" title="Datos de contacto">
        {isAdmin && !isArchived ? (
          <CustomerEditForm
            customerId={customer.id}
            initialFullName={customer.fullName}
            initialPhone={customer.phone}
            initialNotes={customer.notes}
          />
        ) : (
          <FactList
            items={[
              { term: "Nombre", value: customer.fullName },
              { term: "Teléfono", value: customer.phone || "Sin teléfono" },
              { term: "Notas internas", value: customer.notes || "Sin notas" },
            ]}
          />
        )}
      </AdminSection>

      <AdminSection
        id="historial"
        title="Pedidos"
        description="Pedidos vinculados a este cliente. Este historial no cambia su estado ni las condiciones de pedidos anteriores."
      >
        {!history.ok ? (
          <Notice tone="attention" title="No pudimos cargar el historial">Recarga para volver a intentarlo.</Notice>
        ) : (
          <>
            <FactList
              items={[
                { term: "Pedidos", value: `${history.data.total} · ${history.data.completed} completado${history.data.completed === 1 ? "" : "s"}` },
                { term: "Pendientes de confirmar", value: Number(summary.pending ?? 0) },
                {
                  term: "Valor de pedidos completados",
                  value: values.map((v) => `${String(v.currency)} ${String(v.amount)}`).join(" · ") || "Sin pedidos completados",
                },
              ]}
            />
            {history.data.items.length === 0 ? (
              <p className={styles.muted}>Aún no hay pedidos vinculados.</p>
            ) : (
              <ul className={styles.list} aria-label="Pedidos del cliente">
                {history.data.items.map((order) => (
                  <li key={order.id}>
                    <Link href={`/admin/import/pedidos/${order.id}` as Route} className={`${styles.row} ${styles.rowNoThumb}`}>
                      <span className={styles.identity}>
                        <strong className={styles.name}>{order.order_number}</strong>
                        <span className={styles.muted}>{formatLimaDateTime(order.created_at)}</span>
                      </span>
                      <span className={styles.state}>
                        <StatusBadge tone={order.status === "pending_whatsapp_confirmation" ? "attention" : order.status === "fulfilled" ? "healthy" : "neutral"}>
                          {importOrderStatusLabel(order.status)}
                        </StatusBadge>
                      </span>
                      <span className={styles.figures}>{formatMoney(order.subtotal_amount, order.currency)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {history.data.total > history.data.pageSize ? (
              <nav className={styles.actionsRow} aria-label="Paginación del historial">
                {history.data.page > 1 ? <ActionLink href={`?page=${history.data.page - 1}`} variant="secondary">Anteriores</ActionLink> : null}
                <span className={styles.muted}>Página {history.data.page}</span>
                {history.data.page * history.data.pageSize < history.data.total ? <ActionLink href={`?page=${history.data.page + 1}`} variant="secondary">Siguientes</ActionLink> : null}
              </nav>
            ) : null}
          </>
        )}
      </AdminSection>

      {isAdmin && !isArchived ? (
        <AdminSection id="mas-acciones" title="Más acciones">
          <CustomerArchiveButton customerId={customer.id} customerName={customer.fullName} />
        </AdminSection>
      ) : null}

      <Disclosure summary="Ver detalle técnico" hint="Fechas y datos del registro">
        <FactList
          items={[
            { term: "Email", value: customer.email || "Sin registrar" },
            { term: "Documento", value: customer.documentId || "Sin registrar" },
            { term: "Registrado", value: formatLimaDateTime(customer.createdAt) },
            { term: "Última actualización", value: formatLimaDateTime(customer.updatedAt) },
            { term: "Verificado", value: customer.verifiedAt ? formatLimaDateTime(customer.verifiedAt) : "Sin verificar" },
            { term: "ID interno", value: customer.id },
          ]}
        />
      </Disclosure>
    </AdminPage>
  );
}
