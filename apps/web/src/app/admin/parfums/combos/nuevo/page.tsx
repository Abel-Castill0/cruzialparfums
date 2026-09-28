import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ActionLink,
  AdminPage,
  AdminPageHeader,
  BackLink,
  Notice,
  ProgressTracker,
} from "@/components/admin/admin-ui";
import { AdminParfumsCombosRepository } from "@/domains/admin-parfums/combos-repository";
import { NewComboForm } from "./new-combo-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nuevo combo" };

export default async function NewComboPage() {
  const result = await getAdminSession();
  if (result.status === "not_configured") redirect("/admin");
  if (result.status === "unavailable") redirect("/admin");
  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "no_membership") redirect("/admin");
  if (result.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (result.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "parfums" && candidate.role === "admin",
  );
  // A viewer can browse the list/detail but never reaches the create form —
  // mirrors the create page for products/categories.
  if (!membership) redirect("/admin/parfums/combos");

  const header = (
    <div>
      <BackLink href="/admin/parfums/combos">Combos</BackLink>
      <AdminPageHeader
        eyebrow="Cruzial Parfums · Combo"
        title="Crear combo"
        description="Un combo se apoya en un producto Parfums que ya existe. Crear el combo no crea ni modifica productos."
      />
    </div>
  );

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <AdminPage>
        {header}
        <Notice tone="danger" title="El backend de administración no está configurado en este entorno." />
      </AdminPage>
    );
  }

  const repository = new AdminParfumsCombosRepository(supabase, membership.businessUnitId);
  const eligibleProducts = await repository.listEligibleProducts();

  return (
    <AdminPage>
      {header}

      <ProgressTracker
        label="Pasos para crear un combo"
        steps={[
          {
            key: "product",
            title: "Elige el producto del combo",
            detail: "Su nombre, precio, fotos y publicación se siguen editando en Productos.",
            state: "current",
          },
          {
            key: "composition",
            title: "Define qué incluye",
            detail: "Después de crearlo, agrega los perfumes de cada presentación en “Composición”.",
            state: "upcoming",
          },
          {
            key: "verification",
            title: "Verifica la composición",
            detail: "Solo una composición verificada puede aparecer en la tienda.",
            state: "upcoming",
          },
        ]}
      />

      {!eligibleProducts.ok ? (
        <Notice tone="danger" title="No pudimos cargar los productos disponibles">
          Recarga la página e inténtalo de nuevo.
        </Notice>
      ) : eligibleProducts.data.length === 0 ? (
        <Notice
          tone="attention"
          title="No hay productos disponibles para un combo"
          action={<ActionLink href="/admin/parfums/productos/nuevo" variant="primary">Crear un producto primero</ActionLink>}
        >
          Cada producto solo puede tener un combo. Esta lista excluye los productos archivados y los que ya tienen uno.
        </Notice>
      ) : (
        <NewComboForm eligibleProducts={eligibleProducts.data} />
      )}
    </AdminPage>
  );
}
