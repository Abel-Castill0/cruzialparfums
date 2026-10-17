"use server";

import { revalidatePath } from "next/cache";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { revalidateContentBlocks } from "@/lib/content/revalidate";
import { findSection, isContentPageSlug, type ContentPageSlug, type ContentUnit } from "@/lib/content/registry";
import { validateBlockContent } from "@/lib/content/schemas";
import type { Json } from "@/lib/supabase/database.types";
import { isValidExpectedTimestamp } from "@/domains/admin-parfums/category-schema";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ContentActionState = { status: "idle" } | { status: "success"; message: string } | { status: "error"; message: string };

const UNAVAILABLE = "El panel no está disponible en este entorno.";
const STALE = "Este contenido cambió en otra sesión. Recarga la página antes de continuar.";
const PATH = "/admin/contenido";

function notAdmin(unit: ContentUnit): string {
  return unit === "import" ? "Se requiere acceso de administrador de Import." : "Se requiere acceso de administrador de Parfums.";
}

function failure(code: string | undefined, fallback: string): ContentActionState {
  if (code === "40001") return { status: "error", message: STALE };
  if (code === "42501") return { status: "error", message: "Tu cuenta no tiene permiso para editar este contenido." };
  if (code === "P0002") return { status: "error", message: "El contenido ya no existe. Recarga la página." };
  if (code === "23503") return { status: "error", message: "Uno de los perfumes elegidos ya no está publicado." };
  return { status: "error", message: fallback };
}

function flatten(errors: Record<string, string>): string {
  return Object.values(errors).filter(Boolean).join(" ");
}

function optional(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

/** Builds the `content` object for the block type from the submitted form, without trusting any extra field. */
function readContentForm(blockType: string, formData: FormData): Record<string, unknown> {
  if (blockType === "hero") {
    return { title: formData.get("title"), ctaLabel: optional(formData, "ctaLabel"), ctaHref: optional(formData, "ctaHref") };
  }
  if (blockType === "carousel") {
    return { title: optional(formData, "title") };
  }
  return {
    title: formData.get("title"),
    body: formData.get("body"),
    ctaLabel: optional(formData, "ctaLabel"),
    ctaHref: optional(formData, "ctaHref"),
  };
}

/** Create or update the block of one section (the "Editar" form). The section and its unit come from the registry, never
 * from the browser. */
export async function saveContentBlockAction(
  page: ContentPageSlug,
  sectionKey: string,
  _previous: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  const section = isContentPageSlug(page) ? findSection(page, sectionKey) : null;
  if (!section) return { status: "error", message: "Sección desconocida." };
  if (formData.get("blockType") !== section.blockType) return { status: "error", message: "El tipo de bloque no coincide." };

  const auth = await requireUnitAdmin(section.unit);
  if (!auth.ok) return { status: "error", message: notAdmin(section.unit) };

  const validated = validateBlockContent(section.blockType, readContentForm(section.blockType, formData));
  if (!validated.ok) return { status: "error", message: flatten(validated.errors) };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: UNAVAILABLE };
  const { error } = await supabase.rpc("admin_save_content_block", {
    p_unit_code: section.unit,
    p_page_slug: page,
    p_section_key: section.key,
    p_block_type: section.blockType,
    p_content: validated.value as unknown as Json,
    p_is_visible: formData.get("isVisible") === "on",
  });
  if (error) return failure(error.code, "No se pudo guardar el contenido.");
  revalidateContentBlocks(page);
  revalidatePath(PATH);
  return { status: "success", message: "Contenido guardado." };
}

export async function setContentBlockVisibilityAction(
  page: ContentPageSlug,
  unit: ContentUnit,
  id: string,
  expectedUpdatedAt: string,
  _previous: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  const auth = await requireUnitAdmin(unit);
  if (!auth.ok) return { status: "error", message: notAdmin(unit) };
  if (!isValidUuid(id) || !isValidExpectedTimestamp(expectedUpdatedAt)) return { status: "error", message: STALE };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: UNAVAILABLE };
  const visible = formData.get("isVisible") === "true";
  const { error } = await supabase.rpc("admin_set_content_block_visibility", {
    p_unit_code: unit,
    p_id: id,
    p_expected_updated_at: expectedUpdatedAt,
    p_is_visible: visible,
  });
  if (error) return failure(error.code, "No se pudo cambiar el estado.");
  revalidateContentBlocks(page);
  revalidatePath(PATH);
  return { status: "success", message: visible ? "La web usa tu edición." : "La web vuelve al contenido original." };
}

/** Removes the row: the section goes back to the code fallback. It never touches the fallback copy itself. */
export async function resetContentBlockAction(
  page: ContentPageSlug,
  unit: ContentUnit,
  id: string,
  _previous: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  const auth = await requireUnitAdmin(unit);
  if (!auth.ok) return { status: "error", message: notAdmin(unit) };
  if (!isValidUuid(id)) return { status: "error", message: STALE };
  if (formData.get("confirmReset") !== "on") return { status: "error", message: "Marca la confirmación para restablecer." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: UNAVAILABLE };
  const { error } = await supabase.rpc("admin_delete_content_block", { p_unit_code: unit, p_id: id });
  if (error) return failure(error.code, "No se pudo restablecer el bloque.");
  revalidateContentBlocks(page);
  revalidatePath(PATH);
  return { status: "success", message: "Bloque restablecido al contenido original." };
}

export async function saveCarouselItemsAction(
  page: ContentPageSlug,
  unit: ContentUnit,
  carouselKey: string,
  _previous: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  const auth = await requireUnitAdmin(unit);
  if (!auth.ok) return { status: "error", message: notAdmin(unit) };
  const ids = formData.getAll("product").filter((value): value is string => typeof value === "string");
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) return { status: "error", message: "Un perfume aparece dos veces." };
  if (!unique.every(isValidUuid)) return { status: "error", message: "Uno de los perfumes elegidos no es válido." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: UNAVAILABLE };
  const { error } = await supabase.rpc("admin_set_carousel_items", { p_unit_code: unit, p_carousel_key: carouselKey, p_product_ids: unique });
  if (error) return failure(error.code, "No se pudo guardar el carrusel.");
  revalidateContentBlocks(page);
  revalidatePath(PATH);
  return { status: "success", message: "Carrusel guardado." };
}
