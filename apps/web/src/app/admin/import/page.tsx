import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminUnitPage } from "@/components/admin/admin-unit-page";
import { getAdminSession } from "@/lib/auth/admin-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Import" };

const areas = [
  "Productos",
  "Categorías",
  "Consolidado / Campañas",
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

  return (
    <AdminUnitPage
      unitLabel="Cruzial Import"
      placeholderAreas={areas}
      role={membership.role}
      email={result.session.email}
    />
  );
}
