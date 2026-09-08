import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminUnitPage } from "@/components/admin/admin-unit-page";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Parfums" };

// Variantes/decants/frascos/disponibilidad/destacado/categorías all live
// inside the Productos module (list + create/edit) — they are not separate
// placeholder cards anymore now that that module is real.
const placeholderAreas = [
  "Combos",
  "Promociones",
  "Mayorista",
  "Pedidos",
  "Media",
  "Settings",
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
  if (supabase) {
    const { count } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("business_unit_id", membership.businessUnitId);
    productCount = count ?? 0;
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
      ]}
      placeholderAreas={placeholderAreas}
      role={membership.role}
      email={result.session.email}
    />
  );
}
