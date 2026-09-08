import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsOrdersRepository } from "@/domains/admin-parfums/orders-repository";
import { orderStatusLabel } from "@/domains/admin-parfums/order-status";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";
import { normalizeParfumsCustomerPhoneForWhatsApp } from "@/domains/orders/customer-whatsapp-link";
import { buildAdminOrderFollowUpMessage, buildWhatsAppUrl } from "@/domains/whatsapp/parfums-message-builder";
import { CopyButton } from "../order-actions";
import styles from "../../productos/page.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: isValidUuid(id) ? "Pedido" : "Pedidos" };
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(amount);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
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

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "parfums",
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

  const repository = new AdminParfumsOrdersRepository(supabase, membership.businessUnitId);
  const detailResult = await repository.getById(id);

  if (!detailResult.ok) {
    if (detailResult.error.type === "not_found") notFound();
    return (
      <div className={styles.page}>
        <main>
          <p className={styles.notice} role="alert">No se pudo cargar el pedido.</p>
        </main>
      </div>
    );
  }

  const { order, lines } = detailResult.data;
  const normalizedPhone = order.customer.phone
    ? normalizeParfumsCustomerPhoneForWhatsApp(order.customer.phone)
    : null;
  const whatsAppUrl = normalizedPhone
    ? buildWhatsAppUrl(
        normalizedPhone,
        buildAdminOrderFollowUpMessage({ customerName: order.customer.name, orderNumber: order.orderNumber }),
      )
    : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/parfums/pedidos" className={styles.back}>← Pedidos</Link>
          <h1>Pedido {order.orderNumber}</h1>
          <p>
            {formatDateTime(order.createdAt)} · {orderStatusLabel(order.status)}
          </p>
        </div>
      </header>

      <main className={styles.formWrapper}>
        <section className={styles.section} aria-labelledby="ref-heading">
          <div className={styles.sectionTitle}>
            <h2 id="ref-heading">Referencia</h2>
            <CopyButton value={order.orderNumber} label="Copiar referencia" />
          </div>
          <dl className={styles.detailList}>
            <div><dt>Número de pedido</dt><dd>{order.orderNumber}</dd></div>
            <div><dt>Fecha</dt><dd>{formatDateTime(order.createdAt)}</dd></div>
            <div><dt>Estado</dt><dd><span className={styles.badge}>{orderStatusLabel(order.status)}</span></dd></div>
          </dl>
          {/* Internal UUID for troubleshooting only — never the primary
              reference an admin works with day to day. */}
          <p className={styles.rowMeta}>ID interno: {order.id}</p>
        </section>

        <section className={styles.section} aria-labelledby="customer-heading">
          <div className={styles.sectionTitle}>
            <h2 id="customer-heading">Cliente</h2>
          </div>
          <dl className={styles.detailList}>
            <div><dt>Nombre</dt><dd>{order.customer.name || "—"}</dd></div>
            <div>
              <dt>Teléfono</dt>
              <dd>
                {order.customer.phone || "—"}
                {order.customer.phone ? (
                  <span className={styles.actionSpacing}>
                    <CopyButton value={order.customer.phone} label="Copiar teléfono" />
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
          {whatsAppUrl ? (
            <p className={styles.spacingTop}>
              <a href={whatsAppUrl} target="_blank" rel="noopener noreferrer" className={styles.primaryButton}>
                Contactar por WhatsApp
              </a>
            </p>
          ) : order.customer.phone ? (
            <p className={styles.rowMeta}>
              No se pudo generar un enlace de WhatsApp seguro para este número. Usa el teléfono copiado arriba.
            </p>
          ) : null}
        </section>

        <section className={styles.section} aria-labelledby="delivery-heading">
          <div className={styles.sectionTitle}>
            <h2 id="delivery-heading">Entrega</h2>
          </div>
          <dl className={styles.detailList}>
            <div><dt>Distrito / Ciudad</dt><dd>{order.delivery.district || "—"}</dd></div>
            <div><dt>Método de entrega</dt><dd>{order.delivery.delivery || "—"}</dd></div>
            {order.delivery.note ? (
              <div><dt>Nota</dt><dd>{order.delivery.note}</dd></div>
            ) : null}
          </dl>
        </section>

        <section className={styles.section} aria-labelledby="lines-heading">
          <div className={styles.sectionTitle}>
            <h2 id="lines-heading">Líneas ({lines.length})</h2>
          </div>
          <table className={styles.variantTable}>
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Presentación</th>
                <th scope="col">Cantidad</th>
                <th scope="col">Precio unitario</th>
                <th scope="col">Total línea</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td data-label="Producto">{line.productNameSnapshot}</td>
                  <td data-label="Presentación">{line.variantLabelSnapshot}</td>
                  <td data-label="Cantidad">{line.quantity}</td>
                  <td data-label="Precio unitario">{money(line.unitPriceAmount, order.currency)}</td>
                  <td data-label="Total línea">{money(line.lineTotalAmount, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={styles.section} aria-labelledby="total-heading">
          <div className={styles.sectionTitle}>
            <h2 id="total-heading">Total</h2>
          </div>
          <p><strong>Subtotal: {money(order.subtotalAmount, order.currency)}</strong></p>
        </section>
      </main>
    </div>
  );
}
