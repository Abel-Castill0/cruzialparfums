"use server";
import { revalidatePath } from "next/cache";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NotificationUnit } from "@/domains/notifications/provider";

/**
 * The switch is platform-wide: the database (admin_set_search_indexing) requires an AAL2 admin membership in EVERY
 * active unit and audits the change per unit. The unit check here only rejects obviously unauthorized sessions early.
 */
export async function setSearchIndexingAction(unit: NotificationUnit, enabled: boolean, version: string) {
  if (unit !== "parfums" && unit !== "import") return { ok: false, message: "Unidad inválida." };
  if (typeof enabled !== "boolean" || typeof version !== "string" || !version) return { ok: false, message: "Solicitud inválida." };
  const auth = await requireUnitAdmin(unit);
  if (!auth.ok) return { ok: false, message: "Acceso con MFA requerido." };
  const db = await createSupabaseServerClient();
  if (!db) return { ok: false, message: "Backend no configurado." };
  const result = await db.rpc("admin_set_search_indexing", { p_enabled: enabled, p_expected_updated_at: version });
  if (result.error) {
    if (result.error.code === "40001") return { ok: false, message: "La configuración cambió en otra sesión. Recarga e inténtalo de nuevo." };
    if (result.error.code === "42501") return { ok: false, message: "Solo un administrador de Parfums e Import (con MFA) puede cambiar la indexación." };
    return { ok: false, message: "No se pudo guardar. El estado anterior se mantiene." };
  }
  // robots.txt and the sitemap are dynamic; the layouts' metadata is refreshed here.
  revalidatePath("/", "layout");
  return { ok: true, message: enabled ? "Indexación permitida. Los buscadores pueden tardar días en reflejarlo." : "Indexación desactivada." };
}
