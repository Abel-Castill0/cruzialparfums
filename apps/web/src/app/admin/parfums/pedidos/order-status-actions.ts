"use server";
import { wakeNotificationWorker } from "@/domains/notifications/wake";

import { revalidatePath } from "next/cache";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";

export type ParfumsOrderActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export async function updateParfumsOrderStatusAction(
  orderId: string,
  expectedStatus: string,
  newStatus: string,
  reason?: string,
): Promise<ParfumsOrderActionState> {
  const auth = await requireUnitAdmin("parfums");
  if (!auth.ok) {
    return {
      status: "error",
      message:
        auth.reason === "forbidden"
          ? "No tienes permiso de administrador para Cruzial Parfums."
          : "Tu sesión expiró. Vuelve a iniciar sesión.",
    };
  }

  // Reject a malformed id here rather than letting it reach the RPC as a
  // raw Postgres uuid-cast error — the RPC remains the final authority on
  // everything else (existence, ownership, transition validity).
  if (!isValidUuid(orderId)) {
    return { status: "error", message: "El pedido no existe o no pertenece a Cruzial Parfums." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { status: "error", message: "El backend de administración no está configurado." };
  }

  const { error } = await supabase.rpc("admin_parfums_update_order_status", {
    p_order_id: orderId,
    p_expected_status: expectedStatus,
    p_new_status: newStatus,
    ...(reason ? { p_reason: reason } : {}),
  });

  if (error) {
    const code = error.code;
    if (code === "P2020") return { status: "error", message: "El pedido fue modificado por otra sesión. Recarga la página." };
    if (code === "P2023") return { status: "error", message: "Transición de estado no permitida." };
    if (code === "P2024") return { status: "error", message: "Un pedido archivado no puede cambiar de estado." };
    if (code === "P2025") return { status: "error", message: "Razón de cancelación inválida." };
    if (code === "P0002") return { status: "error", message: "El pedido no existe o no pertenece a Cruzial Parfums." };
    if (code === "42501") return { status: "error", message: "No tienes permiso de administrador para Cruzial Parfums." };
    return { status: "error", message: "No se pudo actualizar el estado. Intenta de nuevo." };
  }

  revalidatePath("/admin/parfums/pedidos");
  wakeNotificationWorker();
  revalidatePath(`/admin/parfums/pedidos/${orderId}`);
  revalidatePath("/admin/parfums");
  return { status: "success", message: "Estado actualizado correctamente." };
}
