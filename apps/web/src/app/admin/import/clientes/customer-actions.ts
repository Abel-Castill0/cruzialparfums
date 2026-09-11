"use server";

import { revalidatePath } from "next/cache";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ImportCustomerActionState =
  | { status: "idle" }
  | { status: "success"; message: string; customerId?: string }
  | { status: "error"; message: string };

const CLIENTES_PATH = "/admin/import/clientes";

function customerDetailPath(id: string): string {
  return `/admin/import/clientes/${id}`;
}

export async function createImportCustomerAction(
  fullName: string,
  phone: string | null,
  notes: string | null,
): Promise<ImportCustomerActionState> {
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

  const { data, error } = await supabase.rpc("admin_import_create_customer", {
    p_full_name: fullName.trim(),
    ...(phone ? { p_phone: phone } : {}),
    ...(notes ? { p_notes: notes } : {}),
  });

  if (error) {
    const code = error.code;
    if (code === "P2026") return { status: "error", message: "Ya existe un cliente activo con ese teléfono." };
    if (code === "22023") return { status: "error", message: "El nombre es obligatorio." };
    if (code === "42501") return { status: "error", message: "No tienes permiso de administrador para Cruzial Import." };
    return { status: "error", message: "No se pudo crear el cliente. Intenta de nuevo." };
  }

  revalidatePath(CLIENTES_PATH);
  revalidatePath("/admin/import");

  const result = Array.isArray(data) ? data[0] : data;
  return {
    status: "success",
    message: "Cliente creado correctamente.",
    customerId: result?.id,
  };
}

export async function updateImportCustomerAction(
  customerId: string,
  fullName: string,
  phone: string | null,
  notes: string | null,
): Promise<ImportCustomerActionState> {
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

  const { data, error } = await supabase.rpc("admin_import_update_customer", {
    p_customer_id: customerId,
    p_full_name: fullName.trim(),
    ...(phone ? { p_phone: phone } : {}),
    ...(notes ? { p_notes: notes } : {}),
  });

  if (error) {
    const code = error.code;
    if (code === "P2026") return { status: "error", message: "Ya existe otro cliente activo con ese teléfono." };
    if (code === "P2027") return { status: "error", message: "Un cliente archivado no puede editarse." };
    if (code === "P0002") return { status: "error", message: "El cliente no existe o no pertenece a Cruzial Import." };
    if (code === "22023") return { status: "error", message: "El nombre es obligatorio." };
    if (code === "42501") return { status: "error", message: "No tienes permiso de administrador para Cruzial Import." };
    return { status: "error", message: "No se pudo guardar. Intenta de nuevo." };
  }

  revalidatePath(CLIENTES_PATH);
  revalidatePath(customerDetailPath(customerId));

  return { status: "success", message: "Cliente actualizado correctamente." };
}

export async function verifyImportCustomerStatusAction(
  customerId: string,
  newStatus: string,
): Promise<ImportCustomerActionState> {
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

  const { data, error } = await supabase.rpc("admin_import_verify_customer_status", {
    p_customer_id: customerId,
    p_new_status: newStatus,
  });

  if (error) {
    const code = error.code;
    if (code === "P2027") return { status: "error", message: "Un cliente archivado no puede cambiar de estado." };
    if (code === "P2032") return { status: "error", message: "Estado de verificación inválido." };
    if (code === "P0002") return { status: "error", message: "El cliente no existe o no pertenece a Cruzial Import." };
    if (code === "42501") return { status: "error", message: "No tienes permiso de administrador para Cruzial Import." };
    return { status: "error", message: "No se pudo cambiar el estado. Intenta de nuevo." };
  }

  revalidatePath(CLIENTES_PATH);
  revalidatePath(customerDetailPath(customerId));

  return { status: "success", message: "Estado de verificación actualizado." };
}

export async function archiveImportCustomerAction(
  customerId: string,
): Promise<ImportCustomerActionState> {
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

  const { data, error } = await supabase.rpc("admin_import_archive_customer", {
    p_customer_id: customerId,
  });

  if (error) {
    const code = error.code;
    if (code === "P2027") return { status: "error", message: "El cliente ya está archivado." };
    if (code === "P0002") return { status: "error", message: "El cliente no existe o no pertenece a Cruzial Import." };
    if (code === "42501") return { status: "error", message: "No tienes permiso de administrador para Cruzial Import." };
    return { status: "error", message: "No se pudo archivar el cliente. Intenta de nuevo." };
  }

  revalidatePath(CLIENTES_PATH);
  revalidatePath(customerDetailPath(customerId));
  revalidatePath("/admin/import");

  return { status: "success", message: "Cliente archivado correctamente." };
}

export async function linkImportCustomerOrderAction(
  orderId: string,
  customerId: string,
): Promise<ImportCustomerActionState> {
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

  const { data, error } = await supabase.rpc("admin_import_link_customer_order", {
    p_order_id: orderId,
    p_customer_id: customerId,
  });

  if (error) {
    const code = error.code;
    if (code === "P2028") return { status: "error", message: "El teléfono del pedido no coincide con el del cliente." };
    if (code === "P2029") return { status: "error", message: "El pedido ya tiene un cliente vinculado." };
    if (code === "P2027") return { status: "error", message: "No se puede vincular un cliente archivado." };
    if (code === "P0002") return { status: "error", message: "El pedido o el cliente no existe." };
    if (code === "42501") return { status: "error", message: "No tienes permiso de administrador para Cruzial Import." };
    return { status: "error", message: "No se pudo vincular. Intenta de nuevo." };
  }

  revalidatePath(`/admin/import/pedidos/${orderId}`);
  revalidatePath(CLIENTES_PATH);

  return { status: "success", message: "Cliente vinculado al pedido correctamente." };
}

export async function createCustomerFromOrderAction(
  orderId: string,
): Promise<ImportCustomerActionState> {
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

  const { data, error } = await supabase.rpc("admin_import_create_customer_from_order", {
    p_order_id: orderId,
  });

  if (error) {
    const code = error.code;
    if (code === "P2029") return { status: "error", message: "El pedido ya tiene un cliente vinculado." };
    if (code === "P2031") return { status: "error", message: "Hay varios clientes activos con este teléfono. Resuélvelo en Clientes." };
    if (code === "P0002") return { status: "error", message: "El pedido no existe o no pertenece a Cruzial Import." };
    if (code === "42501") return { status: "error", message: "No tienes permiso de administrador para Cruzial Import." };
    if (code === "22023") return { status: "error", message: "El pedido no tiene teléfono registrado para crear un cliente." };
    return { status: "error", message: "No se pudo procesar. Intenta de nuevo." };
  }

  const result = Array.isArray(data) ? data[0] : data;
  const action = result?.action;
  const customerId = result?.customer_id;

  revalidatePath(`/admin/import/pedidos/${orderId}`);
  revalidatePath(CLIENTES_PATH);
  revalidatePath("/admin/import");

  if (action === "linked") {
    return { status: "success", message: "Cliente existente vinculado al pedido.", customerId };
  }
  return { status: "success", message: "Cliente creado desde el pedido y vinculado.", customerId };
}
