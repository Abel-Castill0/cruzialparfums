import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ActionLink,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  AttentionList,
  EmptyState,
  FactList,
  Notice,
  StatusBadge,
  type AttentionItem,
} from "@/components/admin/admin-ui";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsOrdersRepository } from "@/domains/admin-parfums/orders-repository";
import { AdminParfumsSettingsRepository } from "@/domains/admin-parfums/settings-repository";
import { AdminComplaintsRepository } from "@/domains/complaints/complaint-repository";
import styles from "../dashboard.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Parfums" };

function n(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

// Action-first overview. Every item is a real, unit-scoped query; an item
// whose count is 0 is omitted, and a query that fails is reported as
// "could not verify" — never as a zero or as "todo al día".
export default async function AdminParfumsPage() {
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

  const isAdmin = membership.role === "admin";
  const items: AttentionItem[] = [];
  let loadFailed = false;
  let contactConfigured: boolean | null = null;
  let publishedCount: number | null = null;
  let draftCount: number | null = null;

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    loadFailed = true;
  } else {
    const unitId = membership.businessUnitId;
    const ordersRepository = new AdminParfumsOrdersRepository(supabase, unitId);
    const complaintsRepository = new AdminComplaintsRepository(supabase, unitId);
    const productCount = (column: "publication_status" | "availability_status", value: string) =>
      supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("business_unit_id", unitId)
        .eq(column, value)
        .is("archived_at", null);

    const [orderCounts, olderPending, draftProducts, publishedProducts, outOfStockProducts, complaintCounts, contact] = await Promise.all([
      ordersRepository.countByStatus(),
      ordersRepository.countPendingOld(),
      productCount("publication_status", "draft"),
      productCount("publication_status", "published"),
      productCount("availability_status", "out_of_stock"),
      complaintsRepository.countByStatus(),
      new AdminParfumsSettingsRepository(supabase, unitId, "parfums").getPublicContact(),
    ]);

    if (orderCounts === null || olderPending === null || complaintCounts === null) loadFailed = true;
    if (draftProducts.error || publishedProducts.error || outOfStockProducts.error) loadFailed = true;

    contactConfigured = contact.ok ? contact.data !== null : null;
    if (!contact.ok) loadFailed = true;
    publishedCount = publishedProducts.error ? null : publishedProducts.count ?? 0;
    draftCount = draftProducts.error ? null : draftProducts.count ?? 0;

    const newComplaints = complaintCounts?.received ?? 0;
    const older = olderPending ?? 0;
    const pending = orderCounts?.pending_whatsapp_confirmation ?? 0;
    const confirmed = orderCounts?.confirmed ?? 0;
    const outOfStock = outOfStockProducts.error ? 0 : outOfStockProducts.count ?? 0;
    const drafts = draftCount ?? 0;

    if (newComplaints > 0) {
      items.push({
        key: "complaints",
        title: `${n(newComplaints, "reclamo nuevo", "reclamos nuevos")} sin revisar`,
        detail: "Un cliente registró un reclamo. Revísalo y registra la respuesta.",
        href: "/admin/parfums/reclamos?status=received",
        actionLabel: "Revisar reclamos",
        tone: "danger",
      });
    }
    if (older > 0) {
      items.push({
        key: "orders-old",
        title: `${n(older, "solicitud lleva", "solicitudes llevan")} 3 días o más sin confirmar`,
        detail: "El cliente sigue esperando respuesta por WhatsApp.",
        href: "/admin/parfums/pedidos?status=pending_whatsapp_confirmation&age=old",
        actionLabel: "Ver solicitudes antiguas",
        tone: "attention",
      });
    }
    if (pending > 0) {
      items.push({
        key: "orders-pending",
        title: `${n(pending, "solicitud espera", "solicitudes esperan")} confirmación por WhatsApp`,
        detail: "Revisa el contacto con el cliente antes de continuar.",
        href: "/admin/parfums/pedidos?status=pending_whatsapp_confirmation",
        actionLabel: "Revisar pedidos",
        tone: "attention",
      });
    }
    if (confirmed > 0) {
      items.push({
        key: "orders-confirmed",
        title: `${n(confirmed, "pedido confirmado", "pedidos confirmados")} por completar`,
        detail: "Coordinados por WhatsApp. Márcalos como atendidos cuando termines.",
        href: "/admin/parfums/pedidos?status=confirmed",
        actionLabel: "Completar pedidos",
        tone: "neutral",
      });
    }
    if (outOfStock > 0) {
      items.push({
        key: "out-of-stock",
        title: `${n(outOfStock, "producto agotado", "productos agotados")}`,
        detail: "Los clientes lo ven como no disponible.",
        href: "/admin/parfums/productos?availability=out_of_stock",
        actionLabel: "Ver productos",
        tone: "neutral",
      });
    }
    if (drafts > 0) {
      items.push({
        key: "drafts",
        title: `${n(drafts, "producto en borrador", "productos en borrador")}`,
        detail: "Los productos en borrador no se muestran en la tienda.",
        href: "/admin/parfums/productos?publication=draft",
        actionLabel: "Revisar borradores",
        tone: "neutral",
      });
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Resumen"
        title="Cruzial Parfums"
        description="Administra pedidos, catálogo y atención desde un solo lugar."
        meta={isAdmin ? "Acceso de administrador." : "Acceso de solo lectura: puedes consultar la información, pero no modificarla."}
        actions={<ActionLink href="/parfums" external>Ver tienda como cliente</ActionLink>}
      />

      {loadFailed ? (
        <Notice tone="attention" title="Parte de la información no se pudo cargar">
          Lo que ves abajo puede estar incompleto. Recarga la página en unos minutos; si persiste, revisa Operaciones.
        </Notice>
      ) : null}

      <AdminSection
        id="atencion"
        title="Requiere tu atención"
        description="Ordenado por urgencia. Solo aparece lo que tiene algo pendiente."
      >
        {items.length > 0 ? (
          <AttentionList items={items} label="Pendientes de Cruzial Parfums" />
        ) : loadFailed ? null : (
          <EmptyState title="No hay pendientes en este momento.">
            No hay solicitudes, pedidos por completar ni reclamos nuevos.
          </EmptyState>
        )}
      </AdminSection>

      <div className={styles.twoColumn}>
        <AdminSection id="estado-tienda" title="Estado de la tienda" description="Datos registrados en el sistema.">
          <FactList
            items={[
              {
                term: "Contacto de WhatsApp",
                value:
                  contactConfigured === null ? (
                    <StatusBadge tone="attention">Sin verificar</StatusBadge>
                  ) : contactConfigured ? (
                    <StatusBadge tone="healthy">Configurado</StatusBadge>
                  ) : (
                    <span className={styles.factWithAction}>
                      <StatusBadge tone="danger">Sin configurar</StatusBadge>
                      <ActionLink href="/admin/parfums/configuracion" variant="quiet">Configurar</ActionLink>
                    </span>
                  ),
              },
              {
                term: "Productos publicados",
                value: publishedCount === null ? <StatusBadge tone="attention">Sin verificar</StatusBadge> : publishedCount,
              },
              {
                term: "Productos en borrador",
                value: draftCount === null ? <StatusBadge tone="attention">Sin verificar</StatusBadge> : draftCount,
              },
            ]}
          />
        </AdminSection>

        <AdminSection id="acciones" title="Accesos rápidos">
          <div className={styles.quickActions}>
            {isAdmin ? (
              <>
                <ActionLink href="/admin/parfums/productos/nuevo" variant="primary">Agregar producto</ActionLink>
                <ActionLink href="/admin/parfums/combos/nuevo">Crear combo</ActionLink>
              </>
            ) : null}
            <ActionLink href="/admin/parfums/pedidos">Ver pedidos</ActionLink>
            {isAdmin ? null : <ActionLink href="/admin/parfums/productos">Ver productos</ActionLink>}
          </div>
        </AdminSection>
      </div>
    </AdminPage>
  );
}
