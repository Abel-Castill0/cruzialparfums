import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminPage, AdminPageHeader, AdminSection, Notice } from "@/components/admin/admin-ui";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readMixedWholesaleRule } from "@/domains/commercial/rule-forms";
import { MixedWholesaleRuleForm } from "./mixed-rule-form";
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
  const ruleResult = await supabase.from("promotion_rules").select("id,conditions,actions,is_active,updated_at").eq("business_unit_id", auth.membership.businessUnitId).eq("rule_type", "wholesale_mixed").maybeSingle();
  const mixed = readMixedWholesaleRule(ruleResult.data);
  const canEdit = auth.membership.role === "admin";
  return <AdminPage>
    <AdminPageHeader eyebrow="Cruzial Import" title="Mayorista" description="Regla vigente: unidades mixtas. Los frascos completos de cualquier tipo suman hacia el mínimo y cada frasco recibe el descuento de su tipo. Los decants no cuentan." meta={canEdit ? "Los cambios se reflejan en la información pública de Import." : "Acceso de solo lectura: un administrador de Import puede modificar las reglas."} />
    <AdminSection title="Regla mixta (vigente)" description="Decidida por el cliente el 2026-10-14: un mínimo de unidades mixtas y un descuento por tipo. No hay tramos por encima del mínimo (T28).">
      {ruleResult.error ? <Notice tone="danger" title="No se pudo consultar la regla mixta" /> : <MixedWholesaleRuleForm rule={mixed} canEdit={canEdit} />}
    </AdminSection>
    <AdminSection title="Reglas por tipo (presentación pública)" description="De aquí salen los descuentos por tipo que muestra la sección Mayorista de Import. El cálculo mixto de arriba es el que manda: mantén aquí los mismos montos y el mismo mínimo en los tres tipos (si difieren, la web pública no muestra el número).">
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
