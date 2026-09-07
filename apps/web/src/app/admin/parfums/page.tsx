import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminUnitPage } from "@/components/admin/admin-unit-page";
import { getAdminSession } from "@/lib/auth/admin-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Parfums" };

const areas = [
  "Productos",
  "Variantes",
  "Decants",
  "Frascos",
  "Disponibilidad",
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

  return (
    <AdminUnitPage
      unitLabel="Cruzial Parfums"
      areas={areas}
      role={membership.role}
      email={result.session.email}
    />
  );
}
