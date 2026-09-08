import type { Metadata } from "next";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { AdminUnitPage } from "@/components/admin/admin-unit-page";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsOrdersRepository } from "@/domains/admin-parfums/orders-repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Parfums" };

// Variantes/decants/frascos/disponibilidad/destacado live inside Productos.
// Categorías has its own CRUD and remains assignable from the product editor.
// Combos also has its own CRUD now — composición, verificación y archive/
// restore sobre un producto Parfums existente. Pedidos (Phase 4E2) is now
// Inbox/Detail only — read-only, no status workflow yet.
const placeholderAreas = [
  "Promociones",
  "Media",
  "Auditoría",
] as const;

export default async function AdminParfumsPage() {
  // Authorization happens here, on the server, for every request — not in the
  // proxy and not by hiding a link. Even if this check were missing, RLS would
  // still refuse the rows; the two layers are deliberately independent.
  const result = await getAdminSession();

  if (result.status === "not_configured") redirect("/admin");
  if (result.status === "unavailable") redirect("/admin");
  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "no_membership") redirect("/admin");

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "parfums",
  );
  if (!membership) redirect("/admin");

  // A real count, not an invented metric: how many Parfums products exist
  // right now. No "sales today" / "top products" — there is no order data to
  // back those yet.
  const supabase = await createSupabaseServerClient();
  let productCount: number | null = null;
  let categoryCount: number | null = null;
  let comboCount: number | null = null;
  let wholesaleBottleCount: number | null = null;
  let pendingOrderCount: number | null = null;
  if (supabase) {
    const ordersRepository = new AdminParfumsOrdersRepository(supabase, membership.businessUnitId);
    const [products, categories, combos, wholesaleBottles, pendingOrders] = await Promise.all([
      supabase.from("products").select("*", { count: "exact", head: true }).eq("business_unit_id", membership.businessUnitId),
      supabase.from("categories").select("*", { count: "exact", head: true }).eq("business_unit_id", membership.businessUnitId),
      supabase
        .from("combos")
        .select("*, product:products!inner(business_unit_id)", { count: "exact", head: true })
        .eq("product.business_unit_id", membership.businessUnitId),
      supabase
        .from("admin_parfums_wholesale_catalog")
        .select("*", { count: "exact", head: true })
        .eq("business_unit_id", membership.businessUnitId),
      ordersRepository.countPendingWhatsappConfirmation(),
    ]);
    productCount = products.count ?? 0;
    categoryCount = categories.count ?? 0;
    comboCount = combos.count ?? 0;
    wholesaleBottleCount = wholesaleBottles.count ?? 0;
    pendingOrderCount = pendingOrders;
  }

  return (
    <AdminUnitPage
      unitLabel="Cruzial Parfums"
      implementedAreas={[
        {
          label: "Productos",
          href: "/admin/parfums/productos",
          summary:
            productCount === null
              ? "Catálogo, variantes, inventario y destacados."
              : `${productCount} producto${productCount === 1 ? "" : "s"} · variantes, inventario y destacados.`,
        },
        {
          label: "Categorías",
          href: "/admin/parfums/categorias",
          summary:
            categoryCount === null
              ? "Jerarquía, publicación y relaciones con productos."
              : `${categoryCount} categoría${categoryCount === 1 ? "" : "s"} · jerarquía, publicación y relaciones.`,
        },
        {
          label: "Combos",
          href: "/admin/parfums/combos",
          summary:
            comboCount === null
              ? "Composición, verificación y archive/restore."
              : `${comboCount} combo${comboCount === 1 ? "" : "s"} · composición, verificación y archive/restore.`,
        },
        {
          label: "Mayorista",
          href: "/admin/parfums/mayorista" as Route,
          summary:
            wholesaleBottleCount === null
              ? "Reglas por tipo comercial y frascos elegibles."
              : `${wholesaleBottleCount} frasco${wholesaleBottleCount === 1 ? "" : "s"} · reglas por tipo comercial y precio derivado.`,
        },
        {
          label: "Pedidos",
          href: "/admin/parfums/pedidos" as Route,
          summary:
            pendingOrderCount === null
              ? "Solicitudes registradas, pendientes por WhatsApp."
              : `${pendingOrderCount} pendiente${pendingOrderCount === 1 ? "" : "s"} por WhatsApp.`,
        },
        {
          label: "Configuración",
          href: "/admin/parfums/configuracion" as Route,
          summary: "Contacto público: WhatsApp y correo.",
        },
      ]}
      placeholderAreas={placeholderAreas}
      role={membership.role}
      email={result.session.email}
    />
  );
}
