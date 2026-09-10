import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  mapPostgrestError,
  type AdminRepositoryError,
  type AdminRepositoryResult,
} from "@/domains/admin-parfums/products-repository";
import type { CampaignFormInput, CampaignStatus } from "./campaign-schema";

type NullableRpcArgs<T> = { [K in keyof T]: T[K] | null };

export type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];

export type CampaignMutationError =
  | AdminRepositoryError
  | { type: "invalid_window" }
  | { type: "already_archived" }
  | { type: "archived_edit" };

export type DuplicateCampaignMutationError =
  | AdminRepositoryError
  | { type: "invalid_input" };

function mapDuplicateCampaignError(error: PostgrestError): DuplicateCampaignMutationError {
  switch (error.code) {
    case "P2010":
      return { type: "invalid_input" };
    default:
      return mapPostgrestError(error);
  }
}

export type CampaignMutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: CampaignMutationError };

export type CampaignListFilters = {
  search?: string;
  status?: CampaignStatus;
  includeArchived?: boolean;
};

export type CampaignListPage = {
  items: CampaignRow[];
  total: number;
  page: number;
  pageSize: number;
};

function mapCampaignError(error: PostgrestError): CampaignMutationError {
  switch (error.code) {
    case "23514":
      return { type: "invalid_window" };
    case "P2007":
      return error.message?.includes("already archived")
        ? { type: "already_archived" }
        : { type: "archived_edit" };
    default:
      return mapPostgrestError(error);
  }
}

/**
 * Admin Import — Consolidado (campaign) lifecycle data access (Phase 4J1).
 *
 * Every write goes through the admin_* RPCs in
 * supabase/migrations/20260909000000_admin_import_consolidados.sql, never a
 * raw `.insert()`/`.update()`/`.delete()` on campaigns: authenticated has no
 * table-level write grant on that table any more (Phase 4J1 closed that
 * bypass), and a direct write would skip the atomic audit_log entry those
 * RPCs write. Reads (`list`/`getById`) still go through the ordinary
 * campaigns_admin_read RLS policy — only writes changed.
 */
export class AdminImportCampaignsRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly businessUnitId: string,
  ) {}

  async list(
    filters: CampaignListFilters,
    pagination: { page: number; pageSize: number },
  ): Promise<AdminRepositoryResult<CampaignListPage>> {
    const page = Math.max(1, pagination.page);
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from("campaigns")
      .select("*", { count: "exact" })
      .eq("business_unit_id", this.businessUnitId)
      .order("number", { ascending: false })
      .range(from, to);

    if (!filters.includeArchived) query = query.is("archived_at", null);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.search?.trim()) {
      const term = filters.search.trim().replace(/[%_]/g, (character) => `\\${character}`);
      query = query.ilike("name", `%${term}%`);
    }

    const { data, error, count } = await query;
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: { items: data ?? [], total: count ?? 0, page, pageSize } };
  }

  async getById(campaignId: string): Promise<AdminRepositoryResult<CampaignRow>> {
    const { data, error } = await this.supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .eq("business_unit_id", this.businessUnitId)
      .maybeSingle();

    if (error) return { ok: false, error: mapPostgrestError(error) };
    if (!data) return { ok: false, error: { type: "not_found" } };
    return { ok: true, data };
  }

  async create(input: CampaignFormInput): Promise<CampaignMutationResult<CampaignRow>> {
    type Args = NullableRpcArgs<Database["public"]["Functions"]["admin_create_campaign"]["Args"]>;
    const payload: Args = {
      p_number: input.number,
      p_name: input.name,
      p_opens_at: input.opensAt,
      p_closes_at: input.closesAt,
      p_public_message: input.publicMessage,
    };
    const { data, error } = await this.supabase.rpc(
      "admin_create_campaign",
      payload as Database["public"]["Functions"]["admin_create_campaign"]["Args"],
    );
    if (error) return { ok: false, error: mapCampaignError(error) };
    return { ok: true, data: data as CampaignRow };
  }

  async update(
    campaignId: string,
    expectedUpdatedAt: string,
    input: CampaignFormInput,
  ): Promise<CampaignMutationResult<CampaignRow>> {
    type Args = NullableRpcArgs<Database["public"]["Functions"]["admin_update_campaign"]["Args"]>;
    const payload: Args = {
      p_campaign_id: campaignId,
      p_expected_updated_at: expectedUpdatedAt,
      p_name: input.name,
      p_opens_at: input.opensAt,
      p_closes_at: input.closesAt,
      p_public_message: input.publicMessage,
    };
    const { data, error } = await this.supabase.rpc(
      "admin_update_campaign",
      payload as Database["public"]["Functions"]["admin_update_campaign"]["Args"],
    );
    if (error) return { ok: false, error: mapCampaignError(error) };
    return { ok: true, data: data as CampaignRow };
  }

  async setStatus(
    campaignId: string,
    expectedUpdatedAt: string,
    status: CampaignStatus,
  ): Promise<CampaignMutationResult<CampaignRow>> {
    const { data, error } = await this.supabase.rpc("admin_set_campaign_status", {
      p_campaign_id: campaignId,
      p_expected_updated_at: expectedUpdatedAt,
      p_status: status,
    });
    if (error) return { ok: false, error: mapCampaignError(error) };
    return { ok: true, data: data as CampaignRow };
  }

  async archive(campaignId: string, expectedUpdatedAt: string): Promise<CampaignMutationResult<CampaignRow>> {
    const { data, error } = await this.supabase.rpc("admin_archive_campaign", {
      p_campaign_id: campaignId,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) return { ok: false, error: mapCampaignError(error) };
    return { ok: true, data: data as CampaignRow };
  }

  /** Duplicates a source campaign into a new draft campaign, copying every
   * campaign_product row exactly (admin_duplicate_campaign RPC — one atomic
   * transaction, rolls back entirely on any failure). Dates and
   * public_message are reset, never copied. */
  async duplicate(
    sourceCampaignId: string,
    newNumber: number,
    newName: string,
  ): Promise<{ ok: true; data: CampaignRow } | { ok: false; error: DuplicateCampaignMutationError }> {
    const { data, error } = await this.supabase.rpc("admin_duplicate_campaign", {
      p_source_campaign_id: sourceCampaignId,
      p_new_number: newNumber,
      p_new_name: newName,
    });
    if (error) return { ok: false, error: mapDuplicateCampaignError(error) };
    return { ok: true, data: data as CampaignRow };
  }
}
