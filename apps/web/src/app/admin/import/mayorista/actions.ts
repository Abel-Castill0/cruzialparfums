"use server";

import { revalidatePath } from "next/cache";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";
import { isValidExpectedTimestamp, validateWholesalePolicyForm } from "@/domains/admin-parfums/wholesale-schema";

export type ImportWholesaleActionState = { status: "idle" | "success" } | { status: "error"; message: string };

export async function updateImportWholesalePolicy(
  policyId: string,
  expectedUpdatedAt: string,
  _previous: ImportWholesaleActionState,
  formData: FormData,
): Promise<ImportWholesaleActionState> {
  const auth = await requireUnitAdmin("import");
  if (!auth.ok || auth.membership.role !== "admin") return { status: "error", message: "Se requiere acceso de administrador de Import." };
  if (!isValidUuid(policyId) || !isValidExpectedTimestamp(expectedUpdatedAt)) return { status: "error", message: "La regla cambió. Recarga la página." };
  const validated = validateWholesalePolicyForm({
    minQuantity: formData.get("minQuantity"),
    discountAmount: formData.get("discountAmount"),
    isActive: formData.get("isActive") === "on",
  });
  if (!validated.ok) return { status: "error", message: Object.values(validated.errors).filter(Boolean).join(" ") };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "El panel no está disponible en este entorno." };
  const { data: policy, error: readError } = await supabase
    .from("wholesale_policies")
    .select("id,business_unit_id,scope,commercial_type,archived_at,updated_at,is_active")
    .eq("id", policyId)
    .eq("business_unit_id", auth.membership.businessUnitId)
    .eq("scope", "per_commercial_type")
    .is("archived_at", null)
    .maybeSingle();
  if (readError || !policy || policy.updated_at !== expectedUpdatedAt || !["arabic", "designer", "niche"].includes(policy.commercial_type ?? "")) {
    return { status: "error", message: "La regla ya no está disponible o cambió. Recarga la página." };
  }
  if (policy.is_active && !validated.value.isActive && formData.get("confirmDisable") !== "on") {
    return { status: "error", message: "Confirma que quieres desactivar esta regla antes de guardar." };
  }
  const { error } = await supabase.rpc("admin_update_wholesale_policy", {
    p_policy_id: policyId,
    p_expected_updated_at: expectedUpdatedAt,
    p_min_quantity: validated.value.minQuantity,
    p_discount_amount: Number(validated.value.discountAmount),
    p_is_active: validated.value.isActive,
  });
  if (error) return { status: "error", message: error.code === "40001" ? "La regla cambió en otra sesión. Recarga la página antes de continuar." : "No se pudo guardar la regla mayorista. Revisa los permisos y vuelve a intentarlo." };
  revalidatePath("/admin/import/mayorista");
  revalidatePath("/import");
  return { status: "success" };
}
