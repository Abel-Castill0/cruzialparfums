"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  AdminParfumsCategoriesRepository,
  type CategoryMutationError,
} from "@/domains/admin-parfums/categories-repository";
import { isValidExpectedTimestamp, validateCategoryForm } from "@/domains/admin-parfums/category-schema";
import { isValidUuid, type FieldErrors } from "@/domains/admin-parfums/product-schema";

type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

export type CategoryActionState =
  | { status: "idle" }
  | { status: "success"; data: CategoryRow }
  | { status: "field_errors"; errors: FieldErrors }
  | { status: "error"; message: string };

const CATEGORIES_PATH = "/admin/parfums/categorias";

function editPath(id: string): Route {
  return `/admin/parfums/categorias/${id}` as Route;
}

function friendlyError(error: CategoryMutationError): string {
  switch (error.type) {
    case "unauthorized":
      return "Tu sesión expiró. Vuelve a iniciar sesión.";
    case "forbidden":
      return "No tienes permiso de administrador para Parfums.";
    case "not_found":
      return "La categoría no existe o no tienes acceso a ella.";
    case "conflict":
      return "Esta categoría fue modificada por otra sesión. Recarga la página antes de continuar.";
    case "unique_violation":
      return error.constraint?.includes("slug")
        ? "Ya existe una categoría con este slug."
        : "Ya existe una categoría con esos datos.";
    case "invalid_reference":
      return "Una relación seleccionada ya no está disponible. Recarga la página.";
    case "invalid_hierarchy":
      return "La categoría padre crearía una jerarquía inválida o un ciclo.";
    case "relations_exist":
      return "No se puede archivar mientras tenga productos asociados o categorías hijas activas. Desasigna los productos y archiva primero las hijas.";
    case "archived_parent":
      return "Restaura primero la categoría padre.";
    case "archived_assignment":
      return "Una categoría archivada no puede asignarse a productos.";
    case "archived_edit":
      return "Restaura la categoría antes de editarla.";
    case "unknown":
      console.error("[admin-parfums:categories] unexpected repository error:", error.message);
      return "Ocurrió un error inesperado. Intenta de nuevo.";
  }
}

async function repositoryOrError(): Promise<
  | { ok: true; repository: AdminParfumsCategoriesRepository }
  | { ok: false; state: CategoryActionState }
> {
  const auth = await requireUnitAdmin("parfums");
  if (!auth.ok) {
    return {
      ok: false,
      state: {
        status: "error",
        message: auth.reason === "forbidden"
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
    repository: new AdminParfumsCategoriesRepository(supabase, auth.membership.businessUnitId),
  };
}

function entries(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, value === "" ? null : value]),
  );
}

export async function createCategoryAction(
  _previous: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const repository = await repositoryOrError();
  if (!repository.ok) return repository.state;
  const validation = validateCategoryForm(entries(formData));
  if (!validation.ok) return { status: "field_errors", errors: validation.errors };

  const result = await repository.repository.create(validation.value);
  if (!result.ok) {
    if (result.error.type === "unique_violation") {
      return { status: "field_errors", errors: { slug: friendlyError(result.error) } };
    }
    if (result.error.type === "invalid_hierarchy") {
      return { status: "field_errors", errors: { parentId: friendlyError(result.error) } };
    }
    return { status: "error", message: friendlyError(result.error) };
  }

  revalidatePath(CATEGORIES_PATH);
  revalidatePath("/admin/parfums");
  redirect(editPath(result.data.id));
}

export async function updateCategoryAction(
  categoryId: string,
  expectedUpdatedAt: string,
  _previous: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  if (!isValidUuid(categoryId)) return { status: "error", message: "Identificador de categoría inválido." };
  if (!isValidExpectedTimestamp(expectedUpdatedAt)) return { status: "error", message: "Versión de categoría inválida. Recarga la página." };
  const repository = await repositoryOrError();
  if (!repository.ok) return repository.state;
  const validation = validateCategoryForm(entries(formData));
  if (!validation.ok) return { status: "field_errors", errors: validation.errors };

  const result = await repository.repository.update(categoryId, expectedUpdatedAt, validation.value);
  if (!result.ok) {
    if (result.error.type === "unique_violation") {
      return { status: "field_errors", errors: { slug: friendlyError(result.error) } };
    }
    if (result.error.type === "invalid_hierarchy" || result.error.type === "archived_parent") {
      return { status: "field_errors", errors: { parentId: friendlyError(result.error) } };
    }
    return { status: "error", message: friendlyError(result.error) };
  }

  revalidatePath(CATEGORIES_PATH);
  revalidatePath(editPath(categoryId));
  return { status: "success", data: result.data };
}

export async function archiveCategoryAction(
  categoryId: string,
  expectedUpdatedAt: string,
): Promise<CategoryActionState> {
  if (!isValidUuid(categoryId)) return { status: "error", message: "Identificador de categoría inválido." };
  if (!isValidExpectedTimestamp(expectedUpdatedAt)) return { status: "error", message: "Versión de categoría inválida. Recarga la página." };
  const repository = await repositoryOrError();
  if (!repository.ok) return repository.state;
  const result = await repository.repository.archive(categoryId, expectedUpdatedAt);
  if (!result.ok) return { status: "error", message: friendlyError(result.error) };
  revalidatePath(CATEGORIES_PATH);
  revalidatePath(editPath(categoryId));
  revalidatePath("/admin/parfums");
  return { status: "success", data: result.data };
}

export async function restoreCategoryAction(
  categoryId: string,
  expectedUpdatedAt: string,
): Promise<CategoryActionState> {
  if (!isValidUuid(categoryId)) return { status: "error", message: "Identificador de categoría inválido." };
  if (!isValidExpectedTimestamp(expectedUpdatedAt)) return { status: "error", message: "Versión de categoría inválida. Recarga la página." };
  const repository = await repositoryOrError();
  if (!repository.ok) return repository.state;
  const result = await repository.repository.restore(categoryId, expectedUpdatedAt);
  if (!result.ok) return { status: "error", message: friendlyError(result.error) };
  revalidatePath(CATEGORIES_PATH);
  revalidatePath(editPath(categoryId));
  revalidatePath("/admin/parfums");
  return { status: "success", data: result.data };
}
