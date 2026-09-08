"use server";

import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsMediaRepository } from "@/domains/admin-parfums/media-repository";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";
import type { AdminRepositoryError } from "@/domains/admin-parfums/products-repository";
import { createUploadAuthorization, destroyAsset, isUploadResultValid, type UploadAuthorization } from "@/lib/media/cloudinary";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server Actions for the Admin Parfums media module (Phase 4F1).
 *
 * Same shape as productos/actions.ts: session -> requireUnitAdmin("parfums")
 * -> validate -> mutation via the repository's RPC calls -> revalidate.
 * The Cloudinary API secret never reaches the browser — only
 * getUploadAuthorizationAction's short-lived signature does — and every
 * Cloudinary upload result the browser reports back is re-validated here
 * (folder prefix, format, size) before it is trusted enough to persist.
 */

type MediaRow = Database["public"]["Tables"]["product_media"]["Row"];

export type ActionState<T> =
  | { status: "idle" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };

function productEditPath(productId: string): Route {
  return `/admin/parfums/productos/${productId}` as Route;
}

function friendlyError(error: AdminRepositoryError): string {
  switch (error.type) {
    case "unauthorized":
      return "Tu sesión expiró. Vuelve a iniciar sesión.";
    case "forbidden":
      return "No tienes permiso de administrador para esta unidad de negocio.";
    case "not_found":
      return "Esta imagen o producto no existe o no tienes acceso a él.";
    case "conflict":
      return "Esto fue modificado por otra sesión. Recarga la página antes de continuar.";
    case "unique_violation":
      return "Ya existe un registro con esos datos.";
    case "invalid_reference":
      return "La variante seleccionada no pertenece a este producto. Recarga la página.";
    case "combo_reference":
      return "Esta acción está bloqueada por una referencia activa.";
    case "unknown":
      console.error("[admin-parfums:media] unexpected repository error:", error.message);
      return "Ocurrió un error inesperado. Intenta de nuevo.";
  }
}

function authErrorMessage(reason: string): string {
  return reason === "forbidden"
    ? "No tienes permiso de administrador para Parfums."
    : "Tu sesión expiró. Vuelve a iniciar sesión.";
}

async function getRepositoryOrError(): Promise<
  { ok: true; repository: AdminParfumsMediaRepository } | { ok: false; state: ActionState<never> }
> {
  const auth = await requireUnitAdmin("parfums");
  if (!auth.ok) return { ok: false, state: { status: "error", message: authErrorMessage(auth.reason) } };

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      ok: false,
      state: { status: "error", message: "El backend de administración no está configurado en este entorno." },
    };
  }

  return { ok: true, repository: new AdminParfumsMediaRepository(supabase) };
}

/**
 * Step 1 of the upload flow: authorize a signed, folder- and format-scoped
 * upload for this product. Returns only what Cloudinary's own upload widget
 * needs — never the API secret.
 */
export async function getUploadAuthorizationAction(
  productId: string,
): Promise<{ status: "success"; data: UploadAuthorization } | { status: "error"; message: string }> {
  if (!isValidUuid(productId)) return { status: "error", message: "Identificador de producto inválido." };

  const auth = await requireUnitAdmin("parfums");
  if (!auth.ok) return { status: "error", message: authErrorMessage(auth.reason) };

  // Confirm the product exists and belongs to this admin's unit before
  // handing out a signature scoped to its folder — RLS on the read below
  // already limits this to the caller's own business unit.
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "El backend de administración no está configurado en este entorno." };

  const { data: product } = await supabase.from("products").select("id").eq("id", productId).maybeSingle();
  if (!product) return { status: "error", message: "Este producto no existe o no tienes acceso a él." };

  const authorization = createUploadAuthorization(productId);
  if (!authorization) {
    return { status: "error", message: "Cloudinary no está configurado en este entorno." };
  }

  return { status: "success", data: authorization };
}

export type CloudinaryUploadResult = {
  publicId: string;
  secureUrl: string;
  width: number | null;
  height: number | null;
  bytes: number;
  format: string;
};

/** Step 2: persist the already-succeeded Cloudinary upload. */
export async function registerMediaAction(
  productId: string,
  variantId: string | null,
  uploadResult: CloudinaryUploadResult,
  alt: string | null,
  setPrimary: boolean,
): Promise<ActionState<MediaRow>> {
  if (!isValidUuid(productId)) return { status: "error", message: "Identificador de producto inválido." };
  if (variantId !== null && !isValidUuid(variantId)) {
    return { status: "error", message: "Identificador de variante inválido." };
  }

  const authCheck = await requireUnitAdmin("parfums");
  if (!authCheck.ok) return { status: "error", message: authErrorMessage(authCheck.reason) };

  if (
    !isUploadResultValid({
      publicId: uploadResult.publicId,
      format: uploadResult.format,
      bytes: uploadResult.bytes,
      productId,
    })
  ) {
    // The Cloudinary response doesn't match what we authorized (wrong
    // folder/format/size) — this is untrusted client-reported data, so it
    // is never persisted. The asset already exists on Cloudinary at this
    // point; since we know it is genuinely invalid, clean it up rather than
    // leaving a rejected upload behind.
    await destroyAsset(uploadResult.publicId);
    return {
      status: "error",
      message: "El archivo subido no es válido. Usa una imagen JPG, PNG o WebP de hasta 10 MB.",
    };
  }

  const repo = await getRepositoryOrError();
  if (!repo.ok) return repo.state;

  const result = await repo.repository.register({
    productId,
    variantId,
    provider: "cloudinary",
    publicId: uploadResult.publicId,
    secureUrl: uploadResult.secureUrl,
    width: uploadResult.width,
    height: uploadResult.height,
    bytes: uploadResult.bytes,
    format: uploadResult.format,
    alt,
    setPrimary,
  });

  if (!result.ok) {
    // The upload itself already succeeded and is intentionally NOT deleted
    // here: this is a validated, legitimate asset — a DB-side failure (a
    // conflict, a dropped connection) is not proof the upload was wrong,
    // and deleting a real asset on a possibly-transient error would be the
    // more destructive mistake. Report the failure explicitly; admin_
    // register_media is safe to retry (it only ever inserts a new row).
    console.error(
      `[admin-parfums:media] upload persisted at Cloudinary but DB registration failed (public_id=${uploadResult.publicId}):`,
      result.error,
    );
    return { status: "error", message: friendlyError(result.error) };
  }

  revalidatePath(productEditPath(productId));
  return { status: "success", data: result.data };
}

export async function updateMediaAction(
  mediaId: string,
  expectedUpdatedAt: string,
  productId: string,
  alt: string | null,
  variantId: string | null,
): Promise<ActionState<MediaRow>> {
  if (!isValidUuid(mediaId)) return { status: "error", message: "Identificador de imagen inválido." };
  if (variantId !== null && !isValidUuid(variantId)) {
    return { status: "error", message: "Identificador de variante inválido." };
  }

  const repo = await getRepositoryOrError();
  if (!repo.ok) return repo.state;

  const result = await repo.repository.update(mediaId, expectedUpdatedAt, alt, variantId);
  if (!result.ok) return { status: "error", message: friendlyError(result.error) };

  revalidatePath(productEditPath(productId));
  return { status: "success", data: result.data };
}

export async function setPrimaryMediaAction(
  mediaId: string,
  expectedUpdatedAt: string,
  productId: string,
): Promise<ActionState<MediaRow>> {
  if (!isValidUuid(mediaId)) return { status: "error", message: "Identificador de imagen inválido." };

  const repo = await getRepositoryOrError();
  if (!repo.ok) return repo.state;

  const result = await repo.repository.setPrimary(mediaId, expectedUpdatedAt);
  if (!result.ok) return { status: "error", message: friendlyError(result.error) };

  revalidatePath(productEditPath(productId));
  return { status: "success", data: result.data };
}

export async function archiveMediaAction(
  mediaId: string,
  expectedUpdatedAt: string,
  productId: string,
): Promise<ActionState<MediaRow>> {
  if (!isValidUuid(mediaId)) return { status: "error", message: "Identificador de imagen inválido." };

  const repo = await getRepositoryOrError();
  if (!repo.ok) return repo.state;

  const result = await repo.repository.archive(mediaId, expectedUpdatedAt);
  if (!result.ok) return { status: "error", message: friendlyError(result.error) };

  revalidatePath(productEditPath(productId));
  return { status: "success", data: result.data };
}

export async function restoreMediaAction(
  mediaId: string,
  expectedUpdatedAt: string,
  productId: string,
): Promise<ActionState<MediaRow>> {
  if (!isValidUuid(mediaId)) return { status: "error", message: "Identificador de imagen inválido." };

  const repo = await getRepositoryOrError();
  if (!repo.ok) return repo.state;

  const result = await repo.repository.restore(mediaId, expectedUpdatedAt);
  if (!result.ok) return { status: "error", message: friendlyError(result.error) };

  revalidatePath(productEditPath(productId));
  return { status: "success", data: result.data };
}

export async function reorderMediaAction(
  productId: string,
  items: { id: string; sortOrder: number }[],
): Promise<ActionState<MediaRow[]>> {
  if (!isValidUuid(productId)) return { status: "error", message: "Identificador de producto inválido." };
  for (const item of items) {
    if (!isValidUuid(item.id)) return { status: "error", message: "Identificador de imagen inválido." };
  }

  const repo = await getRepositoryOrError();
  if (!repo.ok) return repo.state;

  const result = await repo.repository.reorder(productId, items);
  if (!result.ok) return { status: "error", message: friendlyError(result.error) };

  revalidatePath(productEditPath(productId));
  return { status: "success", data: result.data };
}
