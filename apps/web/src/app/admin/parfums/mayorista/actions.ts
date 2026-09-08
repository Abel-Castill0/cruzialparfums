"use server";

import { revalidatePath } from "next/cache";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid, type FieldErrors } from "@/domains/admin-parfums/product-schema";
import {
  isValidExpectedTimestamp,
  validateWholesalePolicyForm,
} from "@/domains/admin-parfums/wholesale-schema";
import {
  AdminParfumsWholesaleRepository,
  type WholesalePolicyRow,
} from "@/domains/admin-parfums/wholesale-repository";

export type WholesalePolicyActionState =
  | { status: "idle" }
  | { status: "success"; data: WholesalePolicyRow }
  | { status: "field_errors"; errors: FieldErrors }
  | { status: "error"; message: string };

function entries(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, value === "" ? null : value]),
  );
}

export async function updateWholesalePolicyAction(
  policyId: string,
  expectedUpdatedAt: string,
  _previous: WholesalePolicyActionState,
  formData: FormData,
): Promise<WholesalePolicyActionState> {
  if (!isValidUuid(policyId)) return { status: "error", message: "Identificador de política inválido." };
  if (!isValidExpectedTimestamp(expectedUpdatedAt)) {
    return { status: "error", message: "Versión de política inválida. Recarga la página." };
  }

  const validation = validateWholesalePolicyForm(entries(formData));
  if (!validation.ok) return { status: "field_errors", errors: validation.errors };

  const auth = await requireUnitAdmin("parfums");
  if (!auth.ok) {
    return {
      status: "error",
      message: auth.reason === "forbidden"
        ? "No tienes permiso de administrador para Parfums."
        : "Tu sesión expiró. Vuelve a iniciar sesión.",
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { status: "error", message: "El backend de administración no está configurado." };
  }

  const repository = new AdminParfumsWholesaleRepository(
    supabase,
    auth.membership.businessUnitId,
  );
  const result = await repository.updatePolicy(policyId, expectedUpdatedAt, validation.value);
  if (!result.ok) {
    switch (result.error.type) {
      case "unauthorized":
        return { status: "error", message: "Tu sesión expiró. Vuelve a iniciar sesión." };
      case "forbidden":
        return { status: "error", message: "No tienes permiso de administrador para Parfums." };
      case "not_found":
        return { status: "error", message: "La política ya no existe o no está disponible." };
      case "conflict":
        return { status: "error", message: "La política cambió en otra sesión. Recarga antes de continuar." };
      case "unknown":
        console.error("[admin-parfums:wholesale] unexpected repository error:", result.error.message);
        return { status: "error", message: "No se pudo guardar la política. Intenta de nuevo." };
      default:
        return { status: "error", message: "No se pudo guardar la política. Revisa los valores." };
    }
  }

  revalidatePath("/admin/parfums/mayorista");
  revalidatePath("/admin/parfums");
  return { status: "success", data: result.data };
}
