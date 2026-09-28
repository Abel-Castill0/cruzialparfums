import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { OrderAutomationProof } from "@/components/admin/order-automation-proof";
import { ActionLink, AdminPage, AdminPageHeader, AdminSection, BackLink, FactList, Notice } from "@/components/admin/admin-ui";
import { CopyButton } from "@/components/admin/copy-button";
import { OrderDetailView } from "@/components/admin/order-detail-view";
import { OrderStatusPanel, type OrderActionOption } from "@/components/admin/order-status-panel";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminImportOrdersRepository } from "@/domains/admin-import/orders-repository";
import { importCustomerStatusLabel } from "@/domains/admin-import/import-status";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";
import {
  buildOrderProgress,
  formatLimaDateTime,
  formatMoney,
  formatRelativeLima,
  orderActionCopy,
  orderNextStep,
  orderStatusPresentation,
} from "@/domains/admin/order-presentation";
import { loadOrderStatusEvents } from "@/domains/admin/order-status-events";
import { updateImportOrderStatusAction } from "../order-actions";
import { CustomerLinkingSection } from "./customer-linking-section";
import workspace from "@/components/admin/order-workspace.module.css";

export const dynamic = "force-dynamic";

const LIST_HREF = "/admin/import/pedidos";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: isValidUuid(id) ? "Pedido Import" : "Pedidos Import" };
}

function buildWhatsAppUrl(phone: string, message: string): string | null {
  const normalized = phone.replace(/[^0-9]/g, "");
  if (normalized.length < 9) return null;
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${normalized}?text=${encoded}`;
}

function toOption(target: string): OrderActionOption | null {
  const copy = orderActionCopy("import", target);
  return copy ? { target, ...copy } : null;
}

function LoadProblem({ title, unitId, orderId }: { title: string; unitId: string; orderId: string }) {
  return (
    <AdminPage>
      <div>
        <BackLink href={LIST_HREF}>Pedidos</BackLink>
        <AdminPageHeader eyebrow="Cruzial Import · Pedido" title="Pedido" />
      </div>
      <Notice tone="danger" title={title}>
        Recarga la página. Si el problema continúa, revisa Operaciones antes de cambiar el estado del pedido.
      </Notice>
      <OrderAutomationProof unit="import" unitId={unitId} orderId={orderId} />
    </AdminPage>
  );
}

export default async function AdminImportOrderDetailPage({
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
  if (result.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (result.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "import",
  );
  if (!membership) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <LoadProblem title="El backend de administración no está configurado en este entorno." unitId={membership.businessUnitId} orderId={id} />;
  }

  const repository = new AdminImportOrdersRepository(supabase, membership.businessUnitId);
  const [detailResult, events] = await Promise.all([
    repository.getById(id),
    loadOrderStatusEvents(supabase, membership.businessUnitId, id),
  ]);

  if (!detailResult.ok) {
    if (detailResult.error.type === "not_found") notFound();
    return <LoadProblem title="No pudimos cargar el pedido." unitId={membership.businessUnitId} orderId={id} />;
  }

  const { order, lines } = detailResult.data;
  const isAdmin = membership.role === "admin";
  const status = orderStatusPresentation("import", order.status);
  const nextStep = orderNextStep("import", order.status);
  const progress = buildOrderProgress({ unit: "import", status: order.status, createdAt: order.createdAt, events });

  const normalizedPhone = order.customer.phone?.replace(/[^0-9]/g, "") ?? null;
  const whatsappUrl = normalizedPhone && normalizedPhone.length >= 9
    ? buildWhatsAppUrl(
        normalizedPhone,
        `Hola ${order.customer.name || "Cliente"}, tu pedido ${order.orderNumber} tiene actualización.`,
      )
    : null;

  let linkedCustomer: { id: string; full_name: string; phone: string | null; verified_customer_status: string; archived_at: string | null } | null = null;
  let linkedCustomerFailed = false;
  if (order.customerId) {
    const customerResult = await repository.getLinkedCustomer(order.customerId);
    if (customerResult.ok) {
      linkedCustomer = customerResult.data;
    } else {
      linkedCustomerFailed = true;
    }
  }

  const openOrder = order.status === "pending_whatsapp_confirmation" || order.status === "confirmed";
  const primary = nextStep?.primaryTarget ? toOption(nextStep.primaryTarget) : null;
  const secondary = (nextStep?.secondaryTargets ?? []).map(toOption).filter((option): option is OrderActionOption => option !== null);
  const now = new Date();

  return (
    <OrderDetailView
      unitName="Cruzial Import"
      listHref={LIST_HREF}
      orderNumber={order.orderNumber}
      customerName={order.customer.name}
      total={formatMoney(order.subtotalAmount, order.currency)}
      createdRelative={formatRelativeLima(order.createdAt, now)}
      createdAbsolute={formatLimaDateTime(order.createdAt)}
      statusLabel={status.label}
      statusTone={status.tone}
      progress={progress}
      nextStep={nextStep}
      nextStepContact={
        openOrder && whatsappUrl ? (
          <div className={workspace.contactActions}>
            <ActionLink href={whatsappUrl} external>Escribir al cliente por WhatsApp</ActionLink>
          </div>
        ) : null
      }
      actions={
        isAdmin ? (
          primary || secondary.length > 0 ? (
            <OrderStatusPanel
              orderId={order.id}
              currentStatus={order.status}
              primary={primary}
              secondary={secondary}
              action={updateImportOrderStatusAction}
            />
          ) : null
        ) : primary || secondary.length > 0 ? (
          <p className={workspace.readOnlyNote}>Acceso de solo lectura: un administrador de Cruzial Import puede cambiar el estado.</p>
        ) : null
      }
      lines={lines.map((line) => ({
        id: line.id,
        product: line.productNameSnapshot,
        presentation: line.variantLabelSnapshot,
        quantity: line.quantity,
        unitPrice: formatMoney(line.unitPriceAmount, order.currency),
        lineTotal: formatMoney(line.lineTotalAmount, order.currency),
      }))}
      subtotal={formatMoney(order.subtotalAmount, order.currency)}
      orderContext={
        <AdminSection
          id="consolidado"
          title="Consolidado y depósito"
          description="Valores registrados al crear el pedido. No cambian si después se edita el consolidado o la política de depósito."
        >
          <FactList
            items={[
              {
                term: "Consolidado",
                value: order.campaignNumber != null ? (
                  order.campaignId ? (
                    <ActionLink href={`/admin/import/consolidados/${order.campaignId}`} variant="quiet">
                      Consolidado #{order.campaignNumber}
                    </ActionLink>
                  ) : (
                    `Consolidado #${order.campaignNumber}`
                  )
                ) : (
                  "Sin consolidado registrado"
                ),
              },
              {
                term: "Porcentaje de depósito",
                value: order.depositPercentageSnapshot != null ? `${order.depositPercentageSnapshot}%` : "Sin registrar",
              },
              {
                term: "Monto de depósito",
                value: order.depositAmountSnapshot != null ? formatMoney(order.depositAmountSnapshot, order.currency) : "Sin registrar",
              },
              {
                term: "Tipo de cliente al pedir",
                value: order.verifiedCustomerStatusSnapshot ? importCustomerStatusLabel(order.verifiedCustomerStatusSnapshot) : "Sin registrar",
              },
            ]}
          />
        </AdminSection>
      }
      customer={
        <>
          <FactList
            items={[
              { term: "Nombre", value: order.customer.name || "Sin nombre" },
              {
                term: "Teléfono",
                value: order.customer.phone ? (
                  <span className={workspace.headerMeta}>
                    {order.customer.phone}
                    <CopyButton value={order.customer.phone} label="Copiar teléfono" />
                  </span>
                ) : (
                  "Sin teléfono"
                ),
              },
            ]}
          />
          {whatsappUrl ? (
            <div className={workspace.contactActions}>
              <ActionLink href={whatsappUrl} external>Contactar por WhatsApp</ActionLink>
            </div>
          ) : null}
        </>
      }
      delivery={
        <FactList
          items={[
            { term: "Distrito", value: order.delivery.district || "Sin indicar" },
            { term: "Dirección", value: order.delivery.address || "Sin indicar" },
            ...(order.delivery.note ? [{ term: "Nota del cliente", value: order.delivery.note }] : []),
            { term: "Costo de envío", value: "Por coordinar" },
          ]}
        />
      }
      asideExtra={
        linkedCustomerFailed ? (
          <Notice tone="attention" title="No pudimos verificar el cliente vinculado">
            Recarga la página antes de registrar o vincular un cliente.
          </Notice>
        ) : isAdmin ? (
          <CustomerLinkingSection
            orderId={order.id}
            customerId={order.customerId}
            linkedCustomer={linkedCustomer}
            orderPhone={order.customer.phone}
            orderName={order.customer.name}
          />
        ) : order.customerId && linkedCustomer ? (
          <CustomerLinkingSection
            orderId={order.id}
            customerId={order.customerId}
            linkedCustomer={linkedCustomer}
            orderPhone={order.customer.phone}
            orderName={order.customer.name}
            readOnly
          />
        ) : null
      }
      technical={
        <>
          <p className={workspace.readOnlyNote}>ID interno: {order.id}</p>
          <OrderAutomationProof unit="import" unitId={membership.businessUnitId} orderId={id} />
        </>
      }
    />
  );
}
