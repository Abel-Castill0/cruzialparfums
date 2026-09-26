"use server";
import { wakeNotificationWorker } from "@/domains/notifications/wake";

import { revalidatePath } from "next/cache";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminComplaintsRepository } from "@/domains/complaints/complaint-repository";
import { isComplaintStatus, type ComplaintStatus } from "@/domains/complaints/complaint-schema";

export type UpdateComplaintStatusResult =
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export async function updateParfumsComplaintStatusAction(
  id: string,
  expectedUpdatedAt: string,
  newStatus: string,
  adminNotes: string,
): Promise<UpdateComplaintStatusResult> {
  if (!isComplaintStatus(newStatus)) {
    return { status: "error", message: "Estado inválido." };
  }

  const auth = await requireUnitAdmin("parfums");
  if (!auth.ok) {
    return {
      status: "error",
      message: auth.reason === "forbidden" ? "No tienes permiso de administrador para Parfums." : "Tu sesión expiró.",
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "El backend de administración no está configurado." };

  const repository = new AdminComplaintsRepository(supabase, auth.membership.businessUnitId);
  const result = await repository.updateStatus(id, expectedUpdatedAt, newStatus as ComplaintStatus, adminNotes);

  if (!result.ok) {
    switch (result.error.type) {
      case "not_found":
        return { status: "error", message: "El reclamo ya no existe." };
      case "conflict":
        return { status: "error", message: "El reclamo fue modificado en otra sesión. Recarga la página." };
      case "forbidden":
        return { status: "error", message: "No tienes permiso de administrador para Parfums." };
      default:
        return { status: "error", message: "No se pudo actualizar. Intenta de nuevo." };
    }
  }

  revalidatePath(`/admin/parfums/reclamos/${id}`);
  wakeNotificationWorker();
  revalidatePath("/admin/parfums/reclamos");
  revalidatePath("/admin/parfums");
  return { status: "success", message: "Estado actualizado." };
}
