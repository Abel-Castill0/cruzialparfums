"use server";

import { revalidatePath } from "next/cache";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { revalidateDeliveryZones } from "@/lib/commercial/revalidate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isValidExpectedTimestamp,
  isValidUuid,
  validateDeliveryZoneForm,
  validateGiftExclusionIds,
  validateShippingAgencyForm,
} from "@/domains/commercial/rule-forms";

export type RulesActionState = { status: "idle" } | { status: "success"; message: string } | { status: "error"; message: string };

const NOT_ADMIN = "Se requiere acceso de administrador de Parfums.";
const UNAVAILABLE = "El panel no está disponible en este entorno.";
const STALE = "Este dato cambió en otra sesión. Recarga la página antes de continuar.";
const PATH = "/admin/parfums/reglas";

function failure(code: string | undefined, fallback: string): RulesActionState {
  if (code === "40001") return { status: "error", message: STALE };
  if (code === "23505") return { status: "error", message: "Ya existe un registro con ese nombre." };
  if (code === "42501") return { status: "error", message: NOT_ADMIN };
  if (code === "P0002") return { status: "error", message: "El registro ya no existe. Recarga la página." };
  return { status: "error", message: fallback };
}

function flatten(errors: Record<string, string>) {
  return Object.values(errors).filter(Boolean).join(" ");
}

/** `id` empty = create. Zones are re-read by the checkout within seconds: the cache tag is expired after every success. */
export async function saveDeliveryZoneAction(
  id: string,
  expectedUpdatedAt: string,
  _previous: RulesActionState,
  formData: FormData,
): Promise<RulesActionState> {
  const auth = await requireUnitAdmin("parfums");
  if (!auth.ok) return { status: "error", message: NOT_ADMIN };
  if (id && (!isValidUuid(id) || !isValidExpectedTimestamp(expectedUpdatedAt))) return { status: "error", message: STALE };
  const validated = validateDeliveryZoneForm({ district: formData.get("district"), isRestricted: formData.get("isRestricted") === "on" });
  if (!validated.ok) return { status: "error", message: flatten(validated.errors) };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: UNAVAILABLE };
  const { error } = await supabase.rpc("admin_save_delivery_zone", {
    p_unit_code: "parfums",
    p_id: (id || null) as unknown as string,
    p_expected_updated_at: (id ? expectedUpdatedAt : null) as unknown as string,
    p_district: validated.value.district,
    p_is_restricted: validated.value.isRestricted,
  });
  if (error) return failure(error.code, "No se pudo guardar el distrito.");
  revalidateDeliveryZones();
  revalidatePath(PATH);
  return { status: "success", message: id ? "Distrito guardado." : "Distrito agregado." };
}

export async function deleteDeliveryZoneAction(id: string, _previous: RulesActionState, formData: FormData): Promise<RulesActionState> {
  const auth = await requireUnitAdmin("parfums");
  if (!auth.ok) return { status: "error", message: NOT_ADMIN };
  if (!isValidUuid(id)) return { status: "error", message: STALE };
  if (formData.get("confirmDelete") !== "on") return { status: "error", message: "Marca la confirmación para eliminar el distrito." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: UNAVAILABLE };
  const { error } = await supabase.rpc("admin_delete_delivery_zone", { p_unit_code: "parfums", p_id: id });
  if (error) return failure(error.code, "No se pudo eliminar el distrito.");
  revalidateDeliveryZones();
  revalidatePath(PATH);
  return { status: "success", message: "Distrito eliminado." };
}

export async function saveShippingAgencyAction(
  id: string,
  expectedUpdatedAt: string,
  _previous: RulesActionState,
  formData: FormData,
): Promise<RulesActionState> {
  const auth = await requireUnitAdmin("parfums");
  if (!auth.ok) return { status: "error", message: NOT_ADMIN };
  if (id && (!isValidUuid(id) || !isValidExpectedTimestamp(expectedUpdatedAt))) return { status: "error", message: STALE };
  const validated = validateShippingAgencyForm({
    name: formData.get("name"),
    coverage: formData.get("coverage"),
    description: formData.get("description"),
    isActive: formData.get("isActive") === "on",
  });
  if (!validated.ok) return { status: "error", message: flatten(validated.errors) };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: UNAVAILABLE };
  const { error } = await supabase.rpc("admin_save_shipping_agency", {
    p_unit_code: "parfums",
    p_id: (id || null) as unknown as string,
    p_expected_updated_at: (id ? expectedUpdatedAt : null) as unknown as string,
    p_name: validated.value.name,
    p_coverage: validated.value.coverage,
    p_description: validated.value.description,
    p_is_active: validated.value.isActive,
  });
  if (error) return failure(error.code, "No se pudo guardar la agencia.");
  revalidatePath(PATH);
  return { status: "success", message: id ? "Agencia guardada." : "Agencia agregada." };
}

export async function deleteShippingAgencyAction(id: string, _previous: RulesActionState, formData: FormData): Promise<RulesActionState> {
  const auth = await requireUnitAdmin("parfums");
  if (!auth.ok) return { status: "error", message: NOT_ADMIN };
  if (!isValidUuid(id)) return { status: "error", message: STALE };
  if (formData.get("confirmDelete") !== "on") return { status: "error", message: "Marca la confirmación para eliminar la agencia." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: UNAVAILABLE };
  const { error } = await supabase.rpc("admin_delete_shipping_agency", { p_unit_code: "parfums", p_id: id });
  if (error) return failure(error.code, "No se pudo eliminar la agencia.");
  revalidatePath(PATH);
  return { status: "success", message: "Agencia eliminada." };
}

/** One rule per unit: the first save creates it, the next ones update it. The list replaces the previous one. */
export async function saveGiftExclusionAction(
  ruleId: string,
  expectedUpdatedAt: string,
  _previous: RulesActionState,
  formData: FormData,
): Promise<RulesActionState> {
  const auth = await requireUnitAdmin("parfums");
  if (!auth.ok) return { status: "error", message: NOT_ADMIN };
  if (ruleId && (!isValidUuid(ruleId) || !isValidExpectedTimestamp(expectedUpdatedAt))) return { status: "error", message: STALE };
  const validated = validateGiftExclusionIds(formData.getAll("excluded"));
  if (!validated.ok) return { status: "error", message: flatten(validated.errors) };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: UNAVAILABLE };
  const { error } = await supabase.rpc("admin_save_promotion_rule", {
    p_unit_code: "parfums",
    p_id: (ruleId || null) as unknown as string,
    p_expected_updated_at: (ruleId ? expectedUpdatedAt : null) as unknown as string,
    p_rule_type: "gift_exclusion",
    p_conditions: { excluded_product_ids: validated.value },
    p_actions: {},
    p_is_active: true,
  });
  if (error) {
    if (error.code === "23503") return { status: "error", message: "Uno de los perfumes elegidos ya no existe en el catálogo." };
    return failure(error.code, "No se pudo guardar la lista de exclusión.");
  }
  revalidatePath(PATH);
  return { status: "success", message: "Lista de exclusión guardada." };
}
