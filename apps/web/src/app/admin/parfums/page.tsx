import type { Metadata } from "next";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { AdminActionCenter, type AdminActionItem } from "@/components/admin/admin-action-center";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsOrdersRepository } from "@/domains/admin-parfums/orders-repository";
import { AdminComplaintsRepository } from "@/domains/complaints/complaint-repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Parfums" };

// "Hoy": what actually needs a decision right now, not a directory of
// modules. Every item below is a real query — no invented KPI, no revenue
// figure. An item that can't be derived safely, or whose count is 0, is
// left out entirely rather than shown as a zero.
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

  const items: AdminActionItem[] = [];
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    const ordersRepository = new AdminParfumsOrdersRepository(supabase, membership.businessUnitId);
    const complaintsRepository = new AdminComplaintsRepository(supabase, membership.businessUnitId);
    const [orderCounts, olderPending, draftProducts, outOfStockProducts, complaintCounts] = await Promise.all([
      ordersRepository.countByStatus(),
      ordersRepository.countPendingOld(),
      supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("business_unit_id", membership.businessUnitId)
        .eq("publication_status", "draft")
        .is("archived_at", null),
      supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("business_unit_id", membership.businessUnitId)
        .eq("availability_status", "out_of_stock")
        .is("archived_at", null),
      complaintsRepository.countByStatus(),
    ]);

    const pending = orderCounts?.pending_whatsapp_confirmation ?? 0;
    const confirmed = orderCounts?.confirmed ?? 0;
    const older = olderPending ?? 0;

    if (pending > 0) {
      items.push({
        label: `${pending} solicitud${pending === 1 ? "" : "es"} pendiente${pending === 1 ? "" : "s"} por WhatsApp`,
        href: "/admin/parfums/pedidos?status=pending_whatsapp_confirmation" as Route,
        tone: "attention",
      });
    }
    if (older > 0) {
      items.push({
        label: `${older} solicitud${older === 1 ? "" : "es"} pendiente${older === 1 ? "" : "s"} desde hace 3+ días`,
        href: "/admin/parfums/pedidos?status=pending_whatsapp_confirmation&age=old" as Route,
        tone: "attention",
      });
    }
    if (confirmed > 0) {
      items.push({
        label: `${confirmed} pedido${confirmed === 1 ? "" : "s"} confirmado${confirmed === 1 ? "" : "s"} por completar`,
        href: "/admin/parfums/pedidos?status=confirmed" as Route,
      });
    }
    if (draftProducts.count && draftProducts.count > 0) {
      items.push({
        label: `${draftProducts.count} producto${draftProducts.count === 1 ? "" : "s"} en borrador`,
        href: "/admin/parfums/productos?publication=draft" as Route,
      });
    }
    if (outOfStockProducts.count && outOfStockProducts.count > 0) {
      items.push({
        label: `${outOfStockProducts.count} producto${outOfStockProducts.count === 1 ? "" : "s"} agotado${outOfStockProducts.count === 1 ? "" : "s"}`,
        href: "/admin/parfums/productos?availability=out_of_stock" as Route,
      });
    }
    const newComplaints = complaintCounts?.received ?? 0;
    if (newComplaints > 0) {
      items.push({
        label: `${newComplaints} reclamo${newComplaints === 1 ? "" : "s"} nuevo${newComplaints === 1 ? "" : "s"} sin revisar`,
        href: "/admin/parfums/reclamos?status=received" as Route,
        tone: "attention",
      });
    }
  }

  return (
    <AdminActionCenter
      title="Hoy en Cruzial Parfums"
      subtitle={`Sesión verificada · ${membership.role === "admin" ? "Administrador" : "Solo lectura"}.`}
      items={items}
      emptyMessage="No hay acciones pendientes en este momento. Todo lo operativo está al día."
    />
  );
}
