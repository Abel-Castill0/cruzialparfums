"use server";

import { revalidatePath } from "next/cache";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminImportOrdersRepository } from "@/domains/admin-import/orders-repository";

export type ImportOrderActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const PEDIDOS_PATH = "/admin/import/pedidos";

function orderDetailPath(id: string): string {
  return `/admin/import/pedidos/${id}`;
}

function friendlyOrderError(error: { type: string }): string {
  switch (error.type) {
    case "forbidden":
      return "No tienes permiso de administrador para Cruzial Import.";
    case "not_found":
      return "El pedido no existe o no pertenece a Cruzial Import.";
    case "conflict":
      return "El pedido fue modificado por otra sesión. Recarga la página.";
    case "unauthorized":
      return "Tu sesión expiró. Vuelve a iniciar sesión.";
    case "unknown":
      return "No se pudo completar la operación. Intenta de nuevo.";
    default:
      return "No se pudo completar la operación. Intenta de nuevo.";
  }
}

export async function updateImportOrderStatusAction(
  orderId: string,
  expectedStatus: string,
  newStatus: string,
  reason?: string,
): Promise<ImportOrderActionState> {
  const auth = await requireUnitAdmin("import");
  if (!auth.ok) {
    return {
      status: "error",
      message: auth.reason === "forbidden"
        ? "No tienes permiso de administrador para Cruzial Import."
        : "Tu sesión expiró. Vuelve a iniciar sesión.",
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { status: "error", message: "El backend de administración no está configurado." };
  }

  const { data, error } = await supabase.rpc("admin_import_update_order_status", {
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
    if (code === "P2025") return { status: "error", message: reason && reason.length < 3 ? "La razón debe tener al menos 3 caracteres." : "Razón de cancelación inválida." };
    if (code === "P0002") return { status: "error", message: "El pedido no existe o no pertenece a Cruzial Import." };
    if (code === "42501") return { status: "error", message: "No tienes permiso de administrador para Cruzial Import." };
    return { status: "error", message: "No se pudo actualizar el estado. Intenta de nuevo." };
  }

  revalidatePath(PEDIDOS_PATH);
  revalidatePath(orderDetailPath(orderId));
  revalidatePath("/admin/import");

  return { status: "success", message: "Estado actualizado correctamente." };
}
