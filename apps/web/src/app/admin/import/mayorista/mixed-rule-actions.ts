"use server";

import { revalidatePath } from "next/cache";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isValidExpectedTimestamp,
  isValidUuid,
  mixedWholesaleRulePayload,
  validateMixedWholesaleForm,
} from "@/domains/commercial/rule-forms";

export type MixedWholesaleState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

/**
 * The mixed wholesale rule: N bottles of ANY commercial type add up, and each bottle gets its own type's discount.
 * One rule per unit; there is no tier above the threshold (T28, docs/wholesale-tiers.md).
 */
export async function saveMixedWholesaleRuleAction(
  ruleId: string,
  expectedUpdatedAt: string,
  _previous: MixedWholesaleState,
  formData: FormData,
): Promise<MixedWholesaleState> {
  const auth = await requireUnitAdmin("import");
  if (!auth.ok) return { status: "error", message: "Se requiere acceso de administrador de Import." };
  if (ruleId && (!isValidUuid(ruleId) || !isValidExpectedTimestamp(expectedUpdatedAt))) {
    return { status: "error", message: "La regla cambió. Recarga la página." };
  }
  const validated = validateMixedWholesaleForm({
    minUnits: formData.get("minUnits"),
    arabic: formData.get("arabic"),
    designer: formData.get("designer"),
    niche: formData.get("niche"),
    isActive: formData.get("isActive") === "on",
  });
  if (!validated.ok) return { status: "error", message: Object.values(validated.errors).join(" ") };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "El panel no está disponible en este entorno." };
  const payload = mixedWholesaleRulePayload(validated.value);
  const { error } = await supabase.rpc("admin_save_promotion_rule", {
    p_unit_code: "import",
    p_id: (ruleId || null) as unknown as string,
    p_expected_updated_at: (ruleId ? expectedUpdatedAt : null) as unknown as string,
    p_rule_type: "wholesale_mixed",
    p_conditions: payload.conditions,
    p_actions: payload.actions,
    p_is_active: validated.value.isActive,
  });
  if (error) {
    return {
      status: "error",
      message: error.code === "40001" ? "La regla cambió en otra sesión. Recarga la página antes de continuar." : "No se pudo guardar la regla mayorista mixta.",
    };
  }
  revalidatePath("/admin/import/mayorista");
  return { status: "success" };
}
