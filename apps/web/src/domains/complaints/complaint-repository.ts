import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { mapPostgrestError, type AdminRepositoryResult } from "@/domains/admin-parfums/products-repository";
import type { ComplaintFormInput, ComplaintStatus } from "./complaint-schema";

export type ComplaintRow = Database["public"]["Tables"]["complaint_book_entries"]["Row"];

export type ComplaintEntry = {
  id: string;
  requestId: string;
  status: ComplaintStatus;
  complaintType: "reclamo" | "queja";
  fullName: string;
  documentType: "dni" | "ce" | "pasaporte";
  documentNumber: string;
  address: string;
  phone: string;
  email: string;
  isMinor: boolean;
  guardianFullName: string | null;
  guardianDocumentNumber: string | null;
  orderReference: string | null;
  detail: string;
  consumerRequest: string;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

function toComplaintEntry(row: ComplaintRow): ComplaintEntry {
  return {
    id: row.id,
    requestId: row.request_id,
    status: row.status as ComplaintStatus,
    complaintType: row.complaint_type as "reclamo" | "queja",
    fullName: row.full_name,
    documentType: row.document_type as "dni" | "ce" | "pasaporte",
    documentNumber: row.document_number,
    address: row.address,
    phone: row.phone,
    email: row.email,
    isMinor: row.is_minor,
    guardianFullName: row.guardian_full_name,
    guardianDocumentNumber: row.guardian_document_number,
    orderReference: row.order_reference,
    detail: row.detail,
    consumerRequest: row.consumer_request,
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  };
}

export type SubmitComplaintError =
  | { type: "invalid_input"; message: string }
  | { type: "unknown"; message: string };

/** Public submission path — mirrors ImportOrderRepository: a thin wrapper
 * over the service-role-only RPC, called from a server action using the
 * admin (service-role) Supabase client. Never called with the anon/public
 * client. */
export async function submitComplaintEntry(
  client: SupabaseClient<Database>,
  businessUnitCode: "parfums" | "import",
  requestId: string,
  input: ComplaintFormInput,
): Promise<{ ok: true; data: ComplaintEntry } | { ok: false; error: SubmitComplaintError }> {
  const { data, error } = await client.rpc("public_submit_complaint_entry", {
    p_business_unit_code: businessUnitCode,
    p_request_id: requestId,
    p_complaint_type: input.complaintType,
    p_full_name: input.fullName,
    p_document_type: input.documentType,
    p_document_number: input.documentNumber,
    p_address: input.address,
    p_phone: input.phone,
    p_email: input.email,
    p_is_minor: input.isMinor,
    p_guardian_full_name: input.guardianFullName || "",
    p_guardian_document_number: input.guardianDocumentNumber || "",
    p_order_reference: input.orderReference || "",
    p_detail: input.detail,
    p_consumer_request: input.consumerRequest,
  });

  if (error) {
    if (error.code === "22023") return { ok: false, error: { type: "invalid_input", message: error.message } };
    return { ok: false, error: { type: "unknown", message: error.message } };
  }
  return { ok: true, data: toComplaintEntry(data as ComplaintRow) };
}

export type ComplaintListPage = {
  items: ComplaintEntry[];
  total: number;
  page: number;
  pageSize: number;
};

/** Admin read access — plain RLS-scoped select (complaint_book_entries_admin_read),
 * same pattern as AdminParfumsOrdersRepository.list. */
export class AdminComplaintsRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly businessUnitId: string,
  ) {}

  async list(
    filters: { status?: ComplaintStatus | undefined; search?: string },
    pagination: { page: number; pageSize: number },
  ): Promise<AdminRepositoryResult<ComplaintListPage>> {
    const page = Math.max(1, pagination.page);
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from("complaint_book_entries")
      .select("*", { count: "exact" })
      .eq("business_unit_id", this.businessUnitId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (filters.status) query = query.eq("status", filters.status);

    const search = filters.search?.trim();
    if (search) {
      const term = search.replace(/[%_]/g, (char) => `\\${char}`);
      query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,document_number.ilike.%${term}%`);
    }

    const { data, error, count } = await query;
    if (error) return { ok: false, error: mapPostgrestError(error) };

    return {
      ok: true,
      data: { items: (data ?? []).map(toComplaintEntry), total: count ?? 0, page, pageSize },
    };
  }

  async getById(id: string): Promise<AdminRepositoryResult<ComplaintEntry>> {
    const { data, error } = await this.supabase
      .from("complaint_book_entries")
      .select("*")
      .eq("id", id)
      .eq("business_unit_id", this.businessUnitId)
      .maybeSingle();

    if (error) return { ok: false, error: mapPostgrestError(error) };
    if (!data) return { ok: false, error: { type: "not_found" } };
    return { ok: true, data: toComplaintEntry(data) };
  }

  async countByStatus(): Promise<Record<ComplaintStatus, number> | null> {
    const statuses: ComplaintStatus[] = ["received", "in_review", "resolved"];
    const counts = {} as Record<ComplaintStatus, number>;
    for (const status of statuses) {
      const { count, error } = await this.supabase
        .from("complaint_book_entries")
        .select("*", { count: "exact", head: true })
        .eq("business_unit_id", this.businessUnitId)
        .eq("status", status);
      if (error) return null;
      counts[status] = count ?? 0;
    }
    return counts;
  }

  async updateStatus(
    id: string,
    expectedUpdatedAt: string,
    status: ComplaintStatus,
    adminNotes: string,
  ): Promise<AdminRepositoryResult<ComplaintEntry>> {
    const { data, error } = await this.supabase.rpc("admin_update_complaint_status", {
      p_id: id,
      p_expected_updated_at: expectedUpdatedAt,
      p_status: status,
      p_admin_notes: adminNotes || "",
    });
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: toComplaintEntry(data as ComplaintRow) };
  }
}
