"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  AdminParfumsProductsRepository,
  type AdminRepositoryError,
} from "@/domains/admin-parfums/products-repository";
import {
  isValidUuid,
  validateInventoryForm,
  validateProductForm,
  validateVariantForm,
  type FieldErrors,
} from "@/domains/admin-parfums/product-schema";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server Actions for the Admin Parfums product module.
 *
 * Every action follows the same shape: session -> requireUnitAdmin("parfums")
 * -> validate -> mutation (via the repository's RPC calls) -> revalidate.
 * None of them trust a business_unit_id, role, or "isAdmin" flag coming from
 * the client — requireUnitAdmin re-resolves the caller's membership from the
 * server-side session on every single call.
 */

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type VariantRow = Database["public"]["Tables"]["product_variants"]["Row"];
type InventoryRow = Database["public"]["Tables"]["inventory"]["Row"];

export type ActionState<T> =
  | { status: "idle" }
  | { status: "success"; data: T }
  | { status: "field_errors"; errors: FieldErrors }
  | { status: "error"; message: string };

const PRODUCTS_LIST_PATH = "/admin/parfums/productos";

function productEditPath(productId: string): Route {
  return `/admin/parfums/productos/${productId}` as Route;
}

/** Maps a repository error to a message safe to render — never the raw
 * Postgres message/details for anything but the constrained "unknown" case,
 * and even then only a fixed, non-leaky sentence. */
function friendlyError(error: AdminRepositoryError, context: "product" | "variant" | "inventory" | "categories"): string {
  switch (error.type) {
    case "unauthorized":
      return "Tu sesión expiró. Vuelve a iniciar sesión.";
    case "forbidden":
      return "No tienes permiso de administrador para esta unidad de negocio.";
    case "not_found":
      return context === "product"
        ? "Este producto no existe o no tienes acceso a él."
        : "El recurso no existe o no tienes acceso a él.";
    case "conflict":
      return "Esto fue modificado por otra sesión. Recarga la página antes de continuar.";
    case "unique_violation":
      if (error.constraint?.includes("slug")) {
        return "Ya existe un producto con este slug.";
      }
      if (error.constraint?.includes("sku")) {
        return "Ya existe una variante con ese SKU.";
      }
      if (error.constraint?.includes("label")) {
        return "Ya existe una variante con ese nombre en este producto.";
      }
      return "Ya existe un registro con esos datos.";
    case "unknown":
      // Logged server-side for diagnosis; never shown to the admin verbatim.
      console.error(`[admin-parfums:${context}] unexpected repository error:`, error.message);
      return "Ocurrió un error inesperado. Intenta de nuevo.";
  }
}

function variantUniqueFieldErrors(
  error: Extract<AdminRepositoryError, { type: "unique_violation" }>,
): FieldErrors {
  const field = error.constraint?.includes("sku") ? "sku" : "label";
  return { [field]: friendlyError(error, "variant") };
}

async function getRepositoryOrError(): Promise<
  { ok: true; repository: AdminParfumsProductsRepository } | { ok: false; state: ActionState<never> }
> {
  const auth = await requireUnitAdmin("parfums");
  if (!auth.ok) {
    const message =
      auth.reason === "forbidden"
        ? "No tienes permiso de administrador para Parfums."
        : "Tu sesión expiró. Vuelve a iniciar sesión.";
    return { ok: false, state: { status: "error", message } };
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
    repository: new AdminParfumsProductsRepository(supabase, auth.membership.businessUnitId),
  };
}

function rawEntries(formData: FormData): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "isFeatured") {
      entries[key] = value === "on" || value === "true";
      continue;
    }
    entries[key] = value === "" ? null : value;
  }
  // Checkboxes that are unchecked never appear in FormData at all.
  if (!entries.isFeatured) entries.isFeatured = false;
  return entries;
}

export async function createProductAction(
  _previous: ActionState<ProductRow>,
  formData: FormData,
): Promise<ActionState<ProductRow>> {
  const repo = await getRepositoryOrError();
  if (!repo.ok) return repo.state;

  const validation = validateProductForm(rawEntries(formData));
  if (!validation.ok) return { status: "field_errors", errors: validation.errors };

  const result = await repo.repository.create("parfums", validation.value);
  if (!result.ok) {
    if (result.error.type === "unique_violation") {
      return { status: "field_errors", errors: { slug: friendlyError(result.error, "product") } };
    }
    return { status: "error", message: friendlyError(result.error, "product") };
  }

  revalidatePath(PRODUCTS_LIST_PATH);
  revalidatePath(productEditPath(result.data.id));
  redirect(productEditPath(result.data.id));
}

export async function updateProductAction(
  productId: string,
  expectedUpdatedAt: string,
  _previous: ActionState<ProductRow>,
  formData: FormData,
): Promise<ActionState<ProductRow>> {
  if (!isValidUuid(productId)) return { status: "error", message: "Identificador de producto inválido." };

  const repo = await getRepositoryOrError();
  if (!repo.ok) return repo.state;

  const validation = validateProductForm(rawEntries(formData));
  if (!validation.ok) return { status: "field_errors", errors: validation.errors };

  const result = await repo.repository.update(productId, expectedUpdatedAt, validation.value);
  if (!result.ok) {
    if (result.error.type === "unique_violation") {
      return { status: "field_errors", errors: { slug: friendlyError(result.error, "product") } };
    }
    return { status: "error", message: friendlyError(result.error, "product") };
  }

  revalidatePath(PRODUCTS_LIST_PATH);
  revalidatePath(productEditPath(productId));
  return { status: "success", data: result.data };
}

export async function archiveProductAction(
  productId: string,
  expectedUpdatedAt: string,
): Promise<ActionState<ProductRow>> {
  if (!isValidUuid(productId)) return { status: "error", message: "Identificador de producto inválido." };

  const repo = await getRepositoryOrError();
  if (!repo.ok) return repo.state;

  const result = await repo.repository.archive(productId, expectedUpdatedAt);
  if (!result.ok) return { status: "error", message: friendlyError(result.error, "product") };

  revalidatePath(PRODUCTS_LIST_PATH);
  revalidatePath(productEditPath(productId));
  return { status: "success", data: result.data };
}

export async function restoreProductAction(
  productId: string,
  expectedUpdatedAt: string,
): Promise<ActionState<ProductRow>> {
  if (!isValidUuid(productId)) return { status: "error", message: "Identificador de producto inválido." };

  const repo = await getRepositoryOrError();
  if (!repo.ok) return repo.state;

  const result = await repo.repository.restore(productId, expectedUpdatedAt);
  if (!result.ok) return { status: "error", message: friendlyError(result.error, "product") };

  revalidatePath(PRODUCTS_LIST_PATH);
  revalidatePath(productEditPath(productId));
  return { status: "success", data: result.data };
}

export async function createVariantAction(
  productId: string,
  _previous: ActionState<VariantRow>,
  formData: FormData,
): Promise<ActionState<VariantRow>> {
  if (!isValidUuid(productId)) return { status: "error", message: "Identificador de producto inválido." };

  const repo = await getRepositoryOrError();
  if (!repo.ok) return repo.state;

  const raw = rawEntries(formData);
  const variantValidation = validateVariantForm(raw);
  const inventoryValidation = validateInventoryForm(raw);

  if (!variantValidation.ok || !inventoryValidation.ok) {
    return {
      status: "field_errors",
      errors: {
        ...(variantValidation.ok ? {} : variantValidation.errors),
        ...(inventoryValidation.ok ? {} : inventoryValidation.errors),
      },
    };
  }

  const result = await repo.repository.createVariant(productId, variantValidation.value, inventoryValidation.value);
  if (!result.ok) {
    if (result.error.type === "unique_violation") {
      return { status: "field_errors", errors: variantUniqueFieldErrors(result.error) };
    }
    return { status: "error", message: friendlyError(result.error, "variant") };
  }

  revalidatePath(productEditPath(productId));
  return { status: "success", data: result.data };
}

export async function updateVariantAction(
  variantId: string,
  expectedUpdatedAt: string,
  productId: string,
  _previous: ActionState<VariantRow>,
  formData: FormData,
): Promise<ActionState<VariantRow>> {
  if (!isValidUuid(variantId)) return { status: "error", message: "Identificador de variante inválido." };

  const repo = await getRepositoryOrError();
  if (!repo.ok) return repo.state;

  const validation = validateVariantForm(rawEntries(formData));
  if (!validation.ok) return { status: "field_errors", errors: validation.errors };

  const result = await repo.repository.updateVariant(variantId, expectedUpdatedAt, validation.value);
  if (!result.ok) {
    if (result.error.type === "unique_violation") {
      return { status: "field_errors", errors: variantUniqueFieldErrors(result.error) };
    }
    return { status: "error", message: friendlyError(result.error, "variant") };
  }

  revalidatePath(productEditPath(productId));
  return { status: "success", data: result.data };
}

export async function archiveVariantAction(
  variantId: string,
  expectedUpdatedAt: string,
  productId: string,
): Promise<ActionState<VariantRow>> {
  if (!isValidUuid(variantId)) return { status: "error", message: "Identificador de variante inválido." };

  const repo = await getRepositoryOrError();
  if (!repo.ok) return repo.state;

  const result = await repo.repository.archiveVariant(variantId, expectedUpdatedAt);
  if (!result.ok) return { status: "error", message: friendlyError(result.error, "variant") };

  revalidatePath(productEditPath(productId));
  return { status: "success", data: result.data };
}

export async function restoreVariantAction(
  variantId: string,
  expectedUpdatedAt: string,
  productId: string,
): Promise<ActionState<VariantRow>> {
  if (!isValidUuid(variantId)) return { status: "error", message: "Identificador de variante inválido." };

  const repo = await getRepositoryOrError();
  if (!repo.ok) return repo.state;

  const result = await repo.repository.restoreVariant(variantId, expectedUpdatedAt);
  if (!result.ok) return { status: "error", message: friendlyError(result.error, "variant") };

  revalidatePath(productEditPath(productId));
  return { status: "success", data: result.data };
}

export async function updateInventoryAction(
  variantId: string,
  expectedUpdatedAt: string,
  productId: string,
  _previous: ActionState<InventoryRow>,
  formData: FormData,
): Promise<ActionState<InventoryRow>> {
  if (!isValidUuid(variantId)) return { status: "error", message: "Identificador de variante inválido." };

  const repo = await getRepositoryOrError();
  if (!repo.ok) return repo.state;

  const validation = validateInventoryForm(rawEntries(formData));
  if (!validation.ok) return { status: "field_errors", errors: validation.errors };

  const result = await repo.repository.updateInventory(variantId, expectedUpdatedAt, validation.value);
  if (!result.ok) return { status: "error", message: friendlyError(result.error, "inventory") };

  revalidatePath(productEditPath(productId));
  return { status: "success", data: result.data };
}

export async function setProductCategoriesAction(
  productId: string,
  categoryIds: string[],
): Promise<ActionState<null>> {
  if (!isValidUuid(productId)) return { status: "error", message: "Identificador de producto inválido." };
  for (const id of categoryIds) {
    if (!isValidUuid(id)) return { status: "error", message: "Identificador de categoría inválido." };
  }

  const repo = await getRepositoryOrError();
  if (!repo.ok) return repo.state;

  const result = await repo.repository.setCategories(productId, categoryIds);
  if (!result.ok) return { status: "error", message: friendlyError(result.error, "categories") };

  revalidatePath(productEditPath(productId));
  return { status: "success", data: null };
}
