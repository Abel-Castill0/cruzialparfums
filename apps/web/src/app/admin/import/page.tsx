import type { Metadata } from "next";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { AdminUnitPage } from "@/components/admin/admin-unit-page";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Import" };

// Consolidado / Campañas has its own CRUD now (Phase 4J1 — lifecycle only:
// create/edit/status/archive). Campaign products/prices/availability is 4J2
// and stays out of this list until it ships.
const placeholderAreas = [
  "Productos",
  "Categorías",
  "Precios",
  "Disponibilidad",
  "Pedidos",
  "Clientes",
  "Delivery",
  "Adelantos",
  "Media",
  "Settings",
  "Auditoría",
] as const;

export default async function AdminImportPage() {
  const result = await getAdminSession();

  if (result.status === "not_configured") redirect("/admin");
  if (result.status === "unavailable") redirect("/admin");
  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "no_membership") redirect("/admin");

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "import",
  );
  if (!membership) redirect("/admin");

  let campaignCount: number | null = null;
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { count } = await supabase
      .from("campaigns")
      .select("*", { count: "exact", head: true })
      .eq("business_unit_id", membership.businessUnitId)
      .is("archived_at", null);
    campaignCount = count ?? 0;
  }

  return (
    <AdminUnitPage
      unitLabel="Cruzial Import"
      implementedAreas={[
        {
          label: "Consolidado / Campañas",
          href: "/admin/import/consolidados" as Route,
          summary:
            campaignCount === null
              ? "Ciclo de vida: crear, editar, cambiar estado y archivar."
              : `${campaignCount} consolidado${campaignCount === 1 ? "" : "s"} activo${campaignCount === 1 ? "" : "s"} · ciclo de vida completo.`,
        },
      ]}
      placeholderAreas={placeholderAreas}
      role={membership.role}
      email={result.session.email}
    />
  );
}
