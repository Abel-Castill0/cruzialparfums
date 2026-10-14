"use server";

import { revalidatePath } from "next/cache";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid, parseShippingCostToCents } from "@/domains/commercial/rule-forms";

export type ShippingCostState = { status: "idle" } | { status: "success"; message: string } | { status: "error"; message: string };

/** Stores the shipping fee the operator quoted over WhatsApp. Empty clears it. The fee never changes the order subtotal. */
export async function setOrderShippingCostAction(orderId: string, _previous: ShippingCostState, formData: FormData): Promise<ShippingCostState> {
  const auth = await requireUnitAdmin("parfums");
  if (!auth.ok) return { status: "error", message: "No tienes permiso de administrador para Cruzial Parfums." };
  if (!isValidUuid(orderId)) return { status: "error", message: "El pedido no existe o no pertenece a Cruzial Parfums." };
  const parsed = parseShippingCostToCents(formData.get("shippingCost"));
  if (!parsed.ok) return { status: "error", message: parsed.errors.shippingCost ?? "Revisa el monto." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "El backend de administración no está configurado." };
  const { error } = await supabase.rpc("admin_parfums_set_order_shipping_cost", {
    p_order_id: orderId,
    p_shipping_cost_cents: parsed.value as unknown as number,
  });
  if (error) {
    if (error.code === "P2024") return { status: "error", message: "Este pedido está archivado y ya no se puede modificar." };
    if (error.code === "P0002") return { status: "error", message: "El pedido no existe o no pertenece a Cruzial Parfums." };
    if (error.code === "42501") return { status: "error", message: "No tienes permiso de administrador para Cruzial Parfums." };
    return { status: "error", message: "No pudimos guardar el costo de envío. Inténtalo otra vez." };
  }
  revalidatePath(`/admin/parfums/pedidos/${orderId}`);
  return { status: "success", message: parsed.value === null ? "Costo de envío borrado." : "Costo de envío guardado." };
}
