"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  AdminImportCampaignsRepository,
  type CampaignMutationError,
} from "@/domains/admin-import/campaigns-repository";
import {
  AdminImportCampaignProductsRepository,
  type CampaignProductMutationError,
} from "@/domains/admin-import/campaign-products-repository";
import {
  isCampaignStatus,
  isValidExpectedTimestamp,
  isValidUuid,
  validateCampaignForm,
} from "@/domains/admin-import/campaign-schema";
import { validateCampaignProductItems } from "@/domains/admin-import/campaign-products-schema";
import type { FieldErrors } from "@/domains/admin-parfums/product-schema";

type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];
type CampaignProductRow = Database["public"]["Tables"]["campaign_products"]["Row"];

export type CampaignActionState =
  | { status: "idle" }
  | { status: "success"; data: CampaignRow }
  | { status: "field_errors"; errors: FieldErrors }
  | { status: "error"; message: string };

export type CampaignProductsActionState =
  | { status: "idle" }
  | { status: "success"; data: { campaign: CampaignRow; items: CampaignProductRow[] } }
  | { status: "field_errors"; errors: FieldErrors }
  | { status: "error"; message: string };

const CONSOLIDADOS_PATH = "/admin/import/consolidados";

function editPath(id: string): Route {
  return `/admin/import/consolidados/${id}` as Route;
}

function friendlyError(error: CampaignMutationError): string {
  switch (error.type) {
    case "unauthorized":
      return "Tu sesión expiró. Vuelve a iniciar sesión.";
    case "forbidden":
      return "No tienes permiso de administrador para Cruzial Import.";
    case "not_found":
      return "El consolidado no existe o no tienes acceso a él.";
    case "conflict":
      return "Este consolidado fue modificado por otra sesión. Recarga la página antes de continuar.";
    case "unique_violation":
      return "Ya existe un consolidado con ese número dentro de Cruzial Import.";
    case "invalid_window":
      return "El cierre debe ser posterior a la apertura.";
    case "already_archived":
      return "Este consolidado ya está archivado.";
    case "archived_edit":
      return "Un consolidado archivado no puede editarse ni cambiar de estado.";
    case "invalid_reference":
    case "combo_reference":
      // Not reachable from this domain — kept only so the shared
      // AdminRepositoryError union stays exhaustively handled here too.
      return "Ocurrió un error inesperado. Intenta de nuevo.";
    case "unknown":
      console.error("[admin-import:consolidados] unexpected repository error:", error.message);
      return "Ocurrió un error inesperado. Intenta de nuevo.";
  }
}

async function repositoryOrError(): Promise<
  | { ok: true; repository: AdminImportCampaignsRepository }
  | { ok: false; state: CampaignActionState }
> {
  const auth = await requireUnitAdmin("import");
  if (!auth.ok) {
    return {
      ok: false,
      state: {
        status: "error",
        message: auth.reason === "forbidden"
          ? "No tienes permiso de administrador para Cruzial Import."
          : "Tu sesión expiró. Vuelve a iniciar sesión.",
      },
    };
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
    repository: new AdminImportCampaignsRepository(supabase, auth.membership.businessUnitId),
  };
}

function friendlyCampaignProductError(error: CampaignProductMutationError): string {
  switch (error.type) {
    case "unauthorized":
      return "Tu sesión expiró. Vuelve a iniciar sesión.";
    case "forbidden":
      return "No tienes permiso de administrador para Cruzial Import.";
    case "not_found":
      return "El consolidado no existe o no tienes acceso a él.";
    case "conflict":
      return "Este consolidado fue modificado por otra sesión. Recarga la página antes de continuar.";
    case "invalid_reference":
      return "Uno de los productos seleccionados no pertenece a Cruzial Import. Recarga la página.";
    case "archived_reference":
      return "No puedes agregar un producto o variante archivado a un consolidado.";
    case "archived_campaign":
      return "Un consolidado archivado no puede tener sus productos editados.";
    case "unique_violation":
      return "Ese producto (con esa variante) ya está en la lista.";
    case "combo_reference":
      // Not reachable from this domain — kept only so the shared
      // AdminRepositoryError union stays exhaustively handled here too.
      return "Ocurrió un error inesperado. Intenta de nuevo.";
    case "unknown":
      console.error("[admin-import:campaign-products] unexpected repository error:", error.message);
      return "Ocurrió un error inesperado. Intenta de nuevo.";
  }
}

async function campaignProductsRepositoryOrError(): Promise<
  | { ok: true; repository: AdminImportCampaignProductsRepository }
  | { ok: false; state: CampaignProductsActionState }
> {
  const auth = await requireUnitAdmin("import");
  if (!auth.ok) {
    return {
      ok: false,
      state: {
        status: "error",
        message: auth.reason === "forbidden"
          ? "No tienes permiso de administrador para Cruzial Import."
          : "Tu sesión expiró. Vuelve a iniciar sesión.",
      },
    };
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
    repository: new AdminImportCampaignProductsRepository(supabase, auth.membership.businessUnitId),
  };
}

function entries(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, value === "" ? null : value]),
  );
}

export async function createCampaignAction(
  _previous: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const repository = await repositoryOrError();
  if (!repository.ok) return repository.state;
  const validation = validateCampaignForm(entries(formData));
  if (!validation.ok) return { status: "field_errors", errors: validation.errors };

  const result = await repository.repository.create(validation.value);
  if (!result.ok) {
    if (result.error.type === "unique_violation") {
      return { status: "field_errors", errors: { number: friendlyError(result.error) } };
    }
    if (result.error.type === "invalid_window") {
      return { status: "field_errors", errors: { closesAt: friendlyError(result.error) } };
    }
    return { status: "error", message: friendlyError(result.error) };
  }

  revalidatePath(CONSOLIDADOS_PATH);
  revalidatePath("/admin/import");
  redirect(editPath(result.data.id));
}

export async function updateCampaignAction(
  campaignId: string,
  expectedUpdatedAt: string,
  _previous: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  if (!isValidUuid(campaignId)) return { status: "error", message: "Identificador de consolidado inválido." };
  if (!isValidExpectedTimestamp(expectedUpdatedAt)) return { status: "error", message: "Versión del consolidado inválida. Recarga la página." };
  const repository = await repositoryOrError();
  if (!repository.ok) return repository.state;
  const validation = validateCampaignForm(entries(formData));
  if (!validation.ok) return { status: "field_errors", errors: validation.errors };

  const result = await repository.repository.update(campaignId, expectedUpdatedAt, validation.value);
  if (!result.ok) {
    if (result.error.type === "invalid_window") {
      return { status: "field_errors", errors: { closesAt: friendlyError(result.error) } };
    }
    return { status: "error", message: friendlyError(result.error) };
  }

  revalidatePath(CONSOLIDADOS_PATH);
  revalidatePath(editPath(campaignId));
  return { status: "success", data: result.data };
}

export async function setCampaignStatusAction(
  campaignId: string,
  expectedUpdatedAt: string,
  status: string,
): Promise<CampaignActionState> {
  if (!isValidUuid(campaignId)) return { status: "error", message: "Identificador de consolidado inválido." };
  if (!isValidExpectedTimestamp(expectedUpdatedAt)) return { status: "error", message: "Versión del consolidado inválida. Recarga la página." };
  if (!isCampaignStatus(status)) return { status: "error", message: "Estado inválido." };
  const repository = await repositoryOrError();
  if (!repository.ok) return repository.state;
  const result = await repository.repository.setStatus(campaignId, expectedUpdatedAt, status);
  if (!result.ok) return { status: "error", message: friendlyError(result.error) };
  revalidatePath(CONSOLIDADOS_PATH);
  revalidatePath(editPath(campaignId));
  return { status: "success", data: result.data };
}

export async function archiveCampaignAction(
  campaignId: string,
  expectedUpdatedAt: string,
): Promise<CampaignActionState> {
  if (!isValidUuid(campaignId)) return { status: "error", message: "Identificador de consolidado inválido." };
  if (!isValidExpectedTimestamp(expectedUpdatedAt)) return { status: "error", message: "Versión del consolidado inválida. Recarga la página." };
  const repository = await repositoryOrError();
  if (!repository.ok) return repository.state;
  const result = await repository.repository.archive(campaignId, expectedUpdatedAt);
  if (!result.ok) return { status: "error", message: friendlyError(result.error) };
  revalidatePath(CONSOLIDADOS_PATH);
  revalidatePath(editPath(campaignId));
  revalidatePath("/admin/import");
  return { status: "success", data: result.data };
}

export async function setCampaignProductsAction(
  campaignId: string,
  expectedUpdatedAt: string,
  rawItems: unknown,
): Promise<CampaignProductsActionState> {
  if (!isValidUuid(campaignId)) return { status: "error", message: "Identificador de consolidado inválido." };
  if (!isValidExpectedTimestamp(expectedUpdatedAt)) {
    return { status: "error", message: "Versión del consolidado inválida. Recarga la página." };
  }

  const validation = validateCampaignProductItems(rawItems);
  if (!validation.ok) return { status: "field_errors", errors: validation.errors };

  const repository = await campaignProductsRepositoryOrError();
  if (!repository.ok) return repository.state;

  const result = await repository.repository.setCampaignProducts(campaignId, expectedUpdatedAt, validation.value);
  if (!result.ok) return { status: "error", message: friendlyCampaignProductError(result.error) };

  revalidatePath(editPath(campaignId));
  return { status: "success", data: result.data };
}
