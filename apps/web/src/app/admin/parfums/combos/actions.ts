"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  AdminParfumsCombosRepository,
  type ComboItemRow,
  type ComboMutationError,
  type ComboRow,
} from "@/domains/admin-parfums/combos-repository";
import {
  isValidExpectedTimestamp,
  validateComboCreateForm,
  validateComboItems,
  validateVerificationStatusInput,
} from "@/domains/admin-parfums/combo-schema";
import { isValidUuid, type FieldErrors } from "@/domains/admin-parfums/product-schema";

/**
 * Server Actions for the Admin Parfums combo module.
 *
 * Same shape as productos/actions.ts and categorias/actions.ts: session ->
 * requireUnitAdmin("parfums") -> validate -> mutation (RPC via the
 * repository) -> revalidate. Nothing here trusts a business_unit_id, role,
 * or archived_at coming from the client.
 */

export type ComboActionState =
  | { status: "idle" }
  | { status: "success"; data: ComboRow }
  | { status: "field_errors"; errors: FieldErrors }
  | { status: "error"; message: string };

export type CompositionActionState =
  | { status: "idle" }
  | { status: "success"; data: { combo: ComboRow; items: ComboItemRow[] } }
  | { status: "field_errors"; errors: FieldErrors }
  | { status: "error"; message: string };

const COMBOS_PATH = "/admin/parfums/combos";

function comboEditPath(comboId: string): Route {
  return `/admin/parfums/combos/${comboId}` as Route;
}

function friendlyError(error: ComboMutationError): string {
  switch (error.type) {
    case "unauthorized":
      return "Tu sesión expiró. Vuelve a iniciar sesión.";
    case "forbidden":
      return "No tienes permiso de administrador para Parfums.";
    case "not_found":
      return "Este combo no existe o no tienes acceso a él.";
    case "conflict":
      return "Este combo fue modificado por otra sesión. Recarga la página antes de continuar.";
    case "unique_violation":
      if (error.constraint?.includes("product_variant_id")) {
        return "Esa variante ya está en la composición del combo.";
      }
      return "Este producto ya tiene un combo asociado.";
    case "invalid_reference":
      return "Una de las variantes seleccionadas ya no está disponible. Recarga la página.";
    case "self_reference":
      return "Un combo no puede incluir una variante de su propio producto.";
    case "archived_reference":
      return "No puedes agregar una variante o producto archivado a la composición, ni crear un combo sobre un producto archivado.";
    case "combo_reference":
      return "No puedes archivar esto porque un combo activo lo referencia. Archiva el combo primero.";
    case "unknown":
      console.error("[admin-parfums:combos] unexpected repository error:", error.message);
      return "Ocurrió un error inesperado. Intenta de nuevo.";
  }
}

async function repositoryOrError(): Promise<
  | { ok: true; repository: AdminParfumsCombosRepository }
  | { ok: false; state: { status: "error"; message: string } }
> {
  const auth = await requireUnitAdmin("parfums");
  if (!auth.ok) {
    return {
      ok: false,
      state: {
        status: "error",
        message:
          auth.reason === "forbidden"
            ? "No tienes permiso de administrador para Parfums."
            : "Tu sesión expiró. Vuelve a iniciar sesión.",
      },
    };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      ok: false,
      state: { status: "error", message: "El backend de administración no está configurado en este entorno." },
    };
  }
  return {
    ok: true,
    repository: new AdminParfumsCombosRepository(supabase, auth.membership.businessUnitId),
  };
}

function entries(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, value === "" ? null : value]),
  );
}

export async function createComboAction(
  _previous: ComboActionState,
  formData: FormData,
): Promise<ComboActionState> {
  const repository = await repositoryOrError();
  if (!repository.ok) return repository.state;

  const validation = validateComboCreateForm(entries(formData));
  if (!validation.ok) return { status: "field_errors", errors: validation.errors };

  const result = await repository.repository.create(validation.value);
  if (!result.ok) {
    if (result.error.type === "unique_violation") {
      return { status: "field_errors", errors: { productId: friendlyError(result.error) } };
    }
    if (result.error.type === "archived_reference") {
      return { status: "field_errors", errors: { productId: friendlyError(result.error) } };
    }
    return { status: "error", message: friendlyError(result.error) };
  }

  revalidatePath(COMBOS_PATH);
  revalidatePath("/admin/parfums");
  redirect(comboEditPath(result.data.id));
}

export async function updateVerificationAction(
  comboId: string,
  expectedUpdatedAt: string,
  status: unknown,
): Promise<ComboActionState> {
  if (!isValidUuid(comboId)) return { status: "error", message: "Identificador de combo inválido." };
  if (!isValidExpectedTimestamp(expectedUpdatedAt)) {
    return { status: "error", message: "Versión de combo inválida. Recarga la página." };
  }

  const validation = validateVerificationStatusInput(status);
  if (!validation.ok) return { status: "field_errors", errors: validation.errors };

  const repository = await repositoryOrError();
  if (!repository.ok) return repository.state;

  const result = await repository.repository.updateVerification(comboId, expectedUpdatedAt, validation.value);
  if (!result.ok) return { status: "error", message: friendlyError(result.error) };

  revalidatePath(comboEditPath(comboId));
  revalidatePath(COMBOS_PATH);
  return { status: "success", data: result.data };
}

export async function archiveComboAction(
  comboId: string,
  expectedUpdatedAt: string,
): Promise<ComboActionState> {
  if (!isValidUuid(comboId)) return { status: "error", message: "Identificador de combo inválido." };
  if (!isValidExpectedTimestamp(expectedUpdatedAt)) {
    return { status: "error", message: "Versión de combo inválida. Recarga la página." };
  }
  const repository = await repositoryOrError();
  if (!repository.ok) return repository.state;

  const result = await repository.repository.archive(comboId, expectedUpdatedAt);
  if (!result.ok) return { status: "error", message: friendlyError(result.error) };

  revalidatePath(comboEditPath(comboId));
  revalidatePath(COMBOS_PATH);
  revalidatePath("/admin/parfums");
  return { status: "success", data: result.data };
}

export async function restoreComboAction(
  comboId: string,
  expectedUpdatedAt: string,
): Promise<ComboActionState> {
  if (!isValidUuid(comboId)) return { status: "error", message: "Identificador de combo inválido." };
  if (!isValidExpectedTimestamp(expectedUpdatedAt)) {
    return { status: "error", message: "Versión de combo inválida. Recarga la página." };
  }
  const repository = await repositoryOrError();
  if (!repository.ok) return repository.state;

  const result = await repository.repository.restore(comboId, expectedUpdatedAt);
  if (!result.ok) return { status: "error", message: friendlyError(result.error) };

  revalidatePath(comboEditPath(comboId));
  revalidatePath(COMBOS_PATH);
  revalidatePath("/admin/parfums");
  return { status: "success", data: result.data };
}

export async function setComboCompositionAction(
  comboId: string,
  expectedUpdatedAt: string,
  rawItems: unknown,
): Promise<CompositionActionState> {
  if (!isValidUuid(comboId)) return { status: "error", message: "Identificador de combo inválido." };
  if (!isValidExpectedTimestamp(expectedUpdatedAt)) {
    return { status: "error", message: "Versión de combo inválida. Recarga la página." };
  }

  const validation = validateComboItems(rawItems);
  if (!validation.ok) return { status: "field_errors", errors: validation.errors };

  for (const item of validation.value) {
    if (!isValidUuid(item.productVariantId)) {
      return { status: "error", message: "Identificador de variante inválido." };
    }
  }

  const repository = await repositoryOrError();
  if (!repository.ok) return repository.state;

  const result = await repository.repository.setComposition(comboId, expectedUpdatedAt, validation.value);
  if (!result.ok) return { status: "error", message: friendlyError(result.error) };

  revalidatePath(comboEditPath(comboId));
  revalidatePath(COMBOS_PATH);
  return { status: "success", data: result.data };
}
