import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminPage, AdminPageHeader, AdminSection, Notice } from "@/components/admin/admin-ui";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ImportWholesalePolicyForm } from "./policy-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mayorista · Cruzial Import" };
const LABELS = { arabic: "Árabe", designer: "Diseñador", niche: "Nicho" } as const;

export default async function ImportWholesaleAdminPage() {
  const auth = await requireUnitAdmin("import");
  if (!auth.ok) redirect(auth.reason === "signed_out" ? "/admin/login" : auth.reason === "mfa_challenge_required" ? "/admin/mfa/challenge" : auth.reason === "mfa_enrollment_required" ? "/admin/mfa/enroll" : "/admin");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <AdminPage><Notice tone="danger" title="Panel no disponible" /></AdminPage>;
  const { data, error } = await supabase.from("wholesale_policies").select("*").eq("business_unit_id", auth.membership.businessUnitId).eq("scope", "per_commercial_type").is("archived_at", null).order("commercial_type");
  const policies = data ?? [];
  const canEdit = auth.membership.role === "admin";
  return <AdminPage>
    <AdminPageHeader eyebrow="Cruzial Import" title="Mayorista" description="Reglas por tipo comercial. Los mínimos se cuentan solo con frascos completos y cada tipo se calcula por separado." meta={canEdit ? "Los cambios se reflejan en la información pública de Import." : "Acceso de solo lectura: un administrador de Import puede modificar las reglas."} />
    <AdminSection title="Reglas vigentes" description="Confirma cada regla con el cliente antes de abrir pedidos mayoristas.">
      {error ? <Notice tone="danger" title="No se pudieron consultar las reglas" /> : policies.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 16 }}>
        {policies.map((policy) => {
          const type = policy.commercial_type;
          if (type !== "arabic" && type !== "designer" && type !== "niche") return null;
          return <ImportWholesalePolicyForm key={policy.id} policy={policy} label={LABELS[type]} canEdit={canEdit} />;
        })}
      </div> : <Notice tone="attention" title="No hay reglas mayoristas configuradas">No se muestra un descuento hasta que las reglas estén guardadas en el espacio de Import.</Notice>}
    </AdminSection>
  </AdminPage>;
}
