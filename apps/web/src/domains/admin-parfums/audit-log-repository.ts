import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { mapPostgrestError, type AdminRepositoryResult } from "./products-repository";

/**
 * Admin Parfums audit log data access (Phase 4G2).
 *
 * Read-only, and deliberately thin: every query below is one call to a
 * SECURITY DEFINER RPC (supabase/migrations/
 * 20260908190000_admin_audit_log_integrity_and_read_model.sql), never a
 * direct `.from("audit_log")` select. That is not strictly required for
 * reads — the audit_log_admin_read RLS policy would also scope rows
 * correctly — but it keeps actor-email resolution (a join against
 * auth.users) in one server-checked place instead of duplicating an
 * auth.users lookup per row in application code, and keeps the same
 * business-unit-code contract every other admin-parfums repository uses.
 *
 * There is no write path here on purpose: this phase ships a read-only
 * audit screen. Do not add an update/delete/insert method to this class.
 */

export type AuditLogListItem = {
  id: string;
  createdAt: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  businessUnitId: string;
};

export type AuditLogListFilters = {
  action?: string;
  entityType?: string;
};

export type AuditLogListPage = {
  items: AuditLogListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type AuditLogDetail = AuditLogListItem & {
  before: Json | null;
  after: Json | null;
};

type ListRow = Database["public"]["Functions"]["admin_list_audit_log"]["Returns"][number];
type DetailRow = Database["public"]["Functions"]["admin_get_audit_log_entry"]["Returns"][number];

function toListItem(row: ListRow | DetailRow): AuditLogListItem {
  return {
    id: row.id,
    createdAt: row.created_at,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    businessUnitId: row.business_unit_id,
  };
}

export class AdminParfumsAuditLogRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly businessUnitCode: "parfums" | "import",
  ) {}

  async list(
    filters: AuditLogListFilters,
    pagination: { page: number; pageSize: number },
  ): Promise<AdminRepositoryResult<AuditLogListPage>> {
    const page = Math.max(1, pagination.page);
    // The RPC itself re-clamps to 30 server-side; this local clamp just
    // keeps the value we echo back in the response (page/pageSize) honest
    // with what the server actually applied.
    const pageSize = Math.min(30, Math.max(1, pagination.pageSize));

    const { data, error } = await this.supabase.rpc("admin_list_audit_log", {
      p_business_unit_code: this.businessUnitCode,
      p_page: page,
      p_page_size: pageSize,
      ...(filters.action ? { p_action: filters.action } : {}),
      ...(filters.entityType ? { p_entity_type: filters.entityType } : {}),
    });

    if (error) return { ok: false, error: mapPostgrestError(error) };

    const rows = (data ?? []) as ListRow[];
    const total = rows[0]?.total_count ?? 0;
    return {
      ok: true,
      data: { items: rows.map(toListItem), total, page, pageSize },
    };
  }

  async getById(entryId: string): Promise<AdminRepositoryResult<AuditLogDetail>> {
    const { data, error } = await this.supabase.rpc("admin_get_audit_log_entry", {
      p_business_unit_code: this.businessUnitCode,
      p_entry_id: entryId,
    });

    if (error) return { ok: false, error: mapPostgrestError(error) };

    const row = ((data ?? []) as DetailRow[])[0];
    if (!row) return { ok: false, error: { type: "not_found" } };

    return {
      ok: true,
      data: { ...toListItem(row), before: row.before, after: row.after },
    };
  }
}
