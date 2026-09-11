import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminImportOrdersRepository } from "@/domains/admin-import/orders-repository";
import { importOrderStatusLabel, allowedImportOrderTransitions } from "@/domains/admin-import/import-status";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";
import { OrderStatusControls } from "./order-status-controls";
import { CustomerLinkingSection } from "./customer-linking-section";
import styles from "../../productos/page.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: isValidUuid(id) ? "Pedido Import" : "Pedidos Import" };
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(amount);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
}

function buildWhatsAppUrl(phone: string, message: string): string | null {
  const normalized = phone.replace(/[^0-9]/g, "");
  if (normalized.length < 9) return null;
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${normalized}?text=${encoded}`;
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

  const repository = new AdminImportOrdersRepository(supabase, membership.businessUnitId);
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
  const transitions = allowedImportOrderTransitions(order.status);
  const isAdmin = membership.role === "admin";

  const normalizedPhone = order.customer.phone?.replace(/[^0-9]/g, "") ?? null;
  const whatsappUrl = normalizedPhone && normalizedPhone.length >= 9
    ? buildWhatsAppUrl(
        normalizedPhone,
        `Hola ${order.customer.name || "Cliente"}, tu pedido ${order.orderNumber} tiene actualización.`,
      )
    : null;

  let linkedCustomer: { id: string; full_name: string; phone: string | null; verified_customer_status: string; archived_at: string | null } | null = null;
  if (order.customerId) {
    const customerResult = await repository.getLinkedCustomer(order.customerId);
    if (customerResult.ok) {
      linkedCustomer = customerResult.data;
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href={"/admin/import/pedidos" as Route} className={styles.back}>← Pedidos</Link>
          <h1>Pedido {order.orderNumber}</h1>
          <p>
            {formatDateTime(order.createdAt)} · {importOrderStatusLabel(order.status)}
          </p>
        </div>
      </header>

      <main className={styles.formWrapper}>
        <section className={styles.section} aria-labelledby="ref-heading">
          <div className={styles.sectionTitle}>
            <h2 id="ref-heading">Referencia</h2>
          </div>
          <dl className={styles.detailList}>
            <div><dt>Número de pedido</dt><dd>{order.orderNumber}</dd></div>
            <div><dt>Fecha</dt><dd>{formatDateTime(order.createdAt)}</dd></div>
            <div><dt>Estado</dt><dd><span className={styles.badge}>{importOrderStatusLabel(order.status)}</span></dd></div>
            {order.campaignNumber != null ? (
              <div><dt>Campaña</dt><dd>Consolidado #{order.campaignNumber}</dd></div>
            ) : null}
          </dl>
          <p className={styles.rowMeta}>ID interno: {order.id}</p>
        </section>

        {isAdmin && transitions.length > 0 ? (
          <OrderStatusControls
            orderId={order.id}
            currentStatus={order.status}
            allowedTransitions={transitions}
          />
        ) : null}

        <section className={styles.section} aria-labelledby="customer-heading">
          <div className={styles.sectionTitle}>
            <h2 id="customer-heading">Cliente</h2>
          </div>
          <dl className={styles.detailList}>
            <div><dt>Nombre</dt><dd>{order.customer.name || "—"}</dd></div>
            <div><dt>Teléfono</dt><dd>{order.customer.phone || "—"}</dd></div>
            <div>
              <dt>Estado verificado al crear</dt>
              <dd>{order.verifiedCustomerStatusSnapshot ?? "—"}</dd>
            </div>
            <div>
              <dt>Política de depósito</dt>
              <dd>{order.depositPercentageSnapshot != null ? `${order.depositPercentageSnapshot}%` : "—"}</dd>
            </div>
          </dl>
          {whatsappUrl ? (
            <p className={styles.spacingTop}>
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={styles.primaryButton}>
                Contactar por WhatsApp
              </a>
            </p>
          ) : null}
        </section>

        {isAdmin ? (
          <CustomerLinkingSection
            orderId={order.id}
            customerId={order.customerId}
            linkedCustomer={linkedCustomer}
            orderPhone={order.customer.phone}
            orderName={order.customer.name}
          />
        ) : order.customerId && linkedCustomer ? (
          <section className={styles.section}>
            <div className={styles.sectionTitle}>
              <h2>Cliente vinculado</h2>
            </div>
            <dl className={styles.detailList}>
              <div><dt>Nombre</dt><dd>{linkedCustomer.full_name}</dd></div>
              <div><dt>Estado</dt><dd>{linkedCustomer.verified_customer_status}</dd></div>
              <div>
                <dt>Enlace</dt>
                <dd><Link href={`/admin/import/clientes/${linkedCustomer.id}` as Route}>Ver cliente →</Link></dd>
              </div>
            </dl>
          </section>
        ) : null}

        <section className={styles.section} aria-labelledby="delivery-heading">
          <div className={styles.sectionTitle}>
            <h2 id="delivery-heading">Entrega</h2>
          </div>
          <dl className={styles.detailList}>
            <div><dt>Distrito</dt><dd>{order.delivery.district || "—"}</dd></div>
            <div><dt>Dirección</dt><dd>{order.delivery.address || "—"}</dd></div>
            {order.delivery.note ? (
              <div><dt>Nota</dt><dd>{order.delivery.note}</dd></div>
            ) : null}
            <div><dt>Costo de envío</dt><dd>Por coordinar</dd></div>
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

        <section className={styles.section} aria-labelledby="summary-heading">
          <div className={styles.sectionTitle}>
            <h2 id="summary-heading">Resumen</h2>
          </div>
          <dl className={styles.detailList}>
            <div><dt>Subtotal</dt><dd><strong>{money(order.subtotalAmount, order.currency)}</strong></dd></div>
            <div><dt>Depósito</dt><dd>{order.depositPercentageSnapshot != null ? `${order.depositPercentageSnapshot}%` : "—"}</dd></div>
            {order.depositAmountSnapshot != null ? (
              <div><dt>Monto depósito</dt><dd>{money(order.depositAmountSnapshot, order.currency)}</dd></div>
            ) : null}
          </dl>
        </section>
      </main>
    </div>
  );
}
