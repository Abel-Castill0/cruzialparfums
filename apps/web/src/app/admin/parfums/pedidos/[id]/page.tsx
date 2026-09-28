import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { OrderAutomationProof } from "@/components/admin/order-automation-proof";
import { ActionLink, AdminPage, AdminPageHeader, BackLink, FactList, Notice } from "@/components/admin/admin-ui";
import { CopyButton } from "@/components/admin/copy-button";
import { OrderDetailView } from "@/components/admin/order-detail-view";
import { OrderStatusPanel, type OrderActionOption } from "@/components/admin/order-status-panel";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsOrdersRepository } from "@/domains/admin-parfums/orders-repository";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";
import { normalizeParfumsCustomerPhoneForWhatsApp } from "@/domains/orders/customer-whatsapp-link";
import { buildAdminOrderFollowUpMessage, buildWhatsAppUrl } from "@/domains/whatsapp/parfums-message-builder";
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
import { updateParfumsOrderStatusAction } from "../order-status-actions";
import workspace from "@/components/admin/order-workspace.module.css";

export const dynamic = "force-dynamic";

const LIST_HREF = "/admin/parfums/pedidos";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: isValidUuid(id) ? "Pedido" : "Pedidos" };
}

function toOption(target: string): OrderActionOption | null {
  const copy = orderActionCopy("parfums", target);
  return copy ? { target, ...copy } : null;
}

function LoadProblem({ title, unitId, orderId }: { title: string; unitId: string; orderId: string }) {
  return (
    <AdminPage>
      <div>
        <BackLink href={LIST_HREF}>Pedidos</BackLink>
        <AdminPageHeader eyebrow="Cruzial Parfums · Pedido" title="Pedido" />
      </div>
      <Notice tone="danger" title={title}>
        Recarga la página. Si el problema continúa, revisa Operaciones antes de cambiar el estado del pedido.
      </Notice>
      <OrderAutomationProof unit="parfums" unitId={unitId} orderId={orderId} />
    </AdminPage>
  );
}

export default async function AdminParfumsOrderDetailPage({
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
    (candidate) => candidate.businessUnitCode === "parfums",
  );
  if (!membership) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <LoadProblem title="El backend de administración no está configurado en este entorno." unitId={membership.businessUnitId} orderId={id} />;
  }

  const repository = new AdminParfumsOrdersRepository(supabase, membership.businessUnitId);
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
  const status = orderStatusPresentation("parfums", order.status);
  const nextStep = orderNextStep("parfums", order.status);
  const progress = buildOrderProgress({ unit: "parfums", status: order.status, createdAt: order.createdAt, events });
  const normalizedPhone = order.customer.phone
    ? normalizeParfumsCustomerPhoneForWhatsApp(order.customer.phone)
    : null;
  const whatsAppUrl = normalizedPhone
    ? buildWhatsAppUrl(
        normalizedPhone,
        buildAdminOrderFollowUpMessage({ customerName: order.customer.name, orderNumber: order.orderNumber }),
      )
    : null;
  const openOrder = order.status === "pending_whatsapp_confirmation" || order.status === "confirmed";
  const primary = nextStep?.primaryTarget ? toOption(nextStep.primaryTarget) : null;
  const secondary = (nextStep?.secondaryTargets ?? []).map(toOption).filter((option): option is OrderActionOption => option !== null);
  const now = new Date();

  return (
    <OrderDetailView
      unitName="Cruzial Parfums"
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
        openOrder && whatsAppUrl ? (
          <div className={workspace.contactActions}>
            <ActionLink href={whatsAppUrl} external>Escribir al cliente por WhatsApp</ActionLink>
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
              action={updateParfumsOrderStatusAction}
            />
          ) : null
        ) : primary || secondary.length > 0 ? (
          <p className={workspace.readOnlyNote}>Acceso de solo lectura: un administrador de Cruzial Parfums puede cambiar el estado.</p>
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
          {whatsAppUrl ? (
            <div className={workspace.contactActions}>
              <ActionLink href={whatsAppUrl} external>Contactar por WhatsApp</ActionLink>
            </div>
          ) : order.customer.phone ? (
            <p className={workspace.readOnlyNote}>
              No se pudo generar un enlace de WhatsApp seguro para este número. Usa el teléfono copiado.
            </p>
          ) : null}
        </>
      }
      delivery={
        <FactList
          items={[
            { term: "Distrito / Ciudad", value: order.delivery.district || "Sin indicar" },
            { term: "Método de entrega", value: order.delivery.delivery || "Sin indicar" },
            ...(order.delivery.note ? [{ term: "Nota del cliente", value: order.delivery.note }] : []),
          ]}
        />
      }
      technical={
        <>
          {/* Internal UUID for troubleshooting only — never the primary
              reference an admin works with day to day. */}
          <p className={workspace.readOnlyNote}>ID interno: {order.id}</p>
          <OrderAutomationProof unit="parfums" unitId={membership.businessUnitId} orderId={id} />
        </>
      }
    />
  );
}
