"use server";

import { revalidatePath } from "next/cache";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FieldErrors } from "@/domains/admin-parfums/product-schema";
import {
  isValidExpectedTimestamp,
  validatePublicContactSettingForm,
} from "@/domains/admin-parfums/settings-schema";
import {
  AdminParfumsSettingsRepository,
  type PublicContactSetting,
} from "@/domains/admin-parfums/settings-repository";

export type PublicContactSettingActionState =
  | { status: "idle" }
  | { status: "success"; data: PublicContactSetting }
  | { status: "field_errors"; errors: FieldErrors }
  | { status: "error"; message: string };

function entries(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, value === "" ? null : value]),
  );
}

// The business unit always comes from the server-resolved admin membership
// (requireUnitAdmin), never from the browser — the caller passes the route's
// own unit code, but authorization is re-checked against the signed-in
// session below regardless of what was bound.
export async function updatePublicContactSettingAction(
  expectedUpdatedAt: string,
  _previous: PublicContactSettingActionState,
  formData: FormData,
): Promise<PublicContactSettingActionState> {
  if (!isValidExpectedTimestamp(expectedUpdatedAt)) {
    return { status: "error", message: "Versión de la configuración inválida. Recarga la página." };
  }

  const validation = validatePublicContactSettingForm(entries(formData));
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

  const repository = new AdminParfumsSettingsRepository(
    supabase,
    auth.membership.businessUnitId,
    "parfums",
  );
  const result = await repository.updatePublicContact(expectedUpdatedAt, validation.value);
  if (!result.ok) {
    switch (result.error.type) {
      case "unauthorized":
        return { status: "error", message: "Tu sesión expiró. Vuelve a iniciar sesión." };
      case "forbidden":
        return { status: "error", message: "No tienes permiso de administrador para Parfums." };
      case "not_found":
        return { status: "error", message: "La configuración ya no existe. Contacta soporte técnico." };
      case "conflict":
        return { status: "error", message: "La configuración cambió en otra sesión. Recarga antes de continuar." };
      case "unknown":
        console.error("[admin-parfums:settings] unexpected repository error:", result.error.message);
        return { status: "error", message: "No se pudo guardar. Revisa los valores e intenta de nuevo." };
      default:
        return { status: "error", message: "No se pudo guardar. Revisa los valores." };
    }
  }

  revalidatePath("/admin/parfums/configuracion");
  revalidatePath("/admin/parfums");
  return { status: "success", data: result.data };
}
