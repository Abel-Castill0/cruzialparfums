"use server";

import { revalidatePath } from "next/cache";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { revalidateParfumsStorefront } from "@/lib/catalog/parfums-storefront-revalidate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";
import { isValidExpectedTimestamp } from "@/domains/admin-parfums/category-schema";
import { MAX_NOTES_PER_PRODUCT, validateNoteForm } from "@/domains/notes/note-forms";

export type NotesActionState = { status: "idle" } | { status: "success"; message: string } | { status: "error"; message: string };

const NOT_ADMIN = "Se requiere acceso de administrador de Parfums.";
const UNAVAILABLE = "El panel no está disponible en este entorno.";
const STALE = "Este dato cambió en otra sesión. Recarga la página antes de continuar.";
const PATH = "/admin/parfums/notas";

function failure(code: string | undefined, fallback: string): NotesActionState {
  if (code === "40001") return { status: "error", message: STALE };
  if (code === "23505") return { status: "error", message: "Ya existe una nota con ese nombre (se ignoran mayúsculas y tildes)." };
  if (code === "42501") return { status: "error", message: NOT_ADMIN };
  if (code === "P0002") return { status: "error", message: "El registro ya no existe. Recarga la página." };
  if (code === "P2050") return { status: "error", message: "Esta nota la usan productos. Quítala de esos productos o desactívala." };
  if (code === "23503") return { status: "error", message: "Una de las notas no existe o está desactivada. Recarga la página." };
  return { status: "error", message: fallback };
}

/** `id` empty = create. The public pages read the notes through the catalog cache: it is expired after every success. */
export async function saveNoteAction(
  id: string,
  expectedUpdatedAt: string,
  _previous: NotesActionState,
  formData: FormData,
): Promise<NotesActionState> {
  const auth = await requireUnitAdmin("parfums");
  if (!auth.ok) return { status: "error", message: NOT_ADMIN };
  if (id && (!isValidUuid(id) || !isValidExpectedTimestamp(expectedUpdatedAt))) return { status: "error", message: STALE };
  const validated = validateNoteForm({
    name: formData.get("name"),
    type: formData.get("type"),
    description: formData.get("description"),
    imageUrl: formData.get("imageUrl"),
    isActive: formData.get("isActive") === "on",
  });
  if (!validated.ok) return { status: "error", message: Object.values(validated.errors).join(" ") };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: UNAVAILABLE };
  const { error } = await supabase.rpc("admin_save_note", {
    p_unit_code: "parfums",
    p_id: (id || null) as unknown as string,
    p_expected_updated_at: (id ? expectedUpdatedAt : null) as unknown as string,
    p_name: validated.value.name,
    p_type: validated.value.type,
    p_description: validated.value.description,
    p_image_url: validated.value.imageUrl,
    p_is_active: validated.value.isActive,
  });
  if (error) return failure(error.code, "No se pudo guardar la nota.");
  revalidatePath(PATH);
  revalidateParfumsStorefront();
  return { status: "success", message: id ? "Nota guardada." : "Nota creada." };
}

export async function deleteNoteAction(id: string, _previous: NotesActionState, formData: FormData): Promise<NotesActionState> {
  const auth = await requireUnitAdmin("parfums");
  if (!auth.ok) return { status: "error", message: NOT_ADMIN };
  if (!isValidUuid(id)) return { status: "error", message: STALE };
  if (formData.get("confirmDelete") !== "on") return { status: "error", message: "Marca la confirmación para eliminar la nota." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: UNAVAILABLE };
  const { error } = await supabase.rpc("admin_delete_note", { p_unit_code: "parfums", p_id: id });
  if (error) return failure(error.code, "No se pudo eliminar la nota.");
  revalidatePath(PATH);
  revalidateParfumsStorefront();
  return { status: "success", message: "Nota eliminada." };
}

/** Replaces the notes of a product with `noteIds`, in that order (the up/down buttons just reorder the list). */
export async function setProductNotesAction(productId: string, noteIds: string[]): Promise<NotesActionState> {
  const auth = await requireUnitAdmin("parfums");
  if (!auth.ok) return { status: "error", message: NOT_ADMIN };
  if (!isValidUuid(productId) || !Array.isArray(noteIds) || !noteIds.every(isValidUuid)) {
    return { status: "error", message: "Identificador inválido." };
  }
  if (noteIds.length > MAX_NOTES_PER_PRODUCT) return { status: "error", message: `Un producto admite hasta ${MAX_NOTES_PER_PRODUCT} notas.` };
  if (new Set(noteIds).size !== noteIds.length) return { status: "error", message: "Una nota no puede repetirse." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: UNAVAILABLE };
  const { error } = await supabase.rpc("admin_set_product_notes", { p_product_id: productId, p_note_ids: noteIds });
  if (error) return failure(error.code, "No se pudieron guardar las notas del producto.");
  revalidatePath(`/admin/parfums/productos/${productId}`);
  revalidatePath(PATH);
  revalidateParfumsStorefront();
  return { status: "success", message: "Notas guardadas." };
}
