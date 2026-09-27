import type { Database } from "@/lib/supabase/database.types";

type ComplaintRow = Database["public"]["Tables"]["complaint_book_entries"]["Row"];

/**
 * The consumer's own copy of a Libro de Reclamaciones entry — the ONLY shape
 * the public submission path may serialize back to a browser.
 *
 * Built by explicit allowlist from the persisted row (never by spreading or
 * omitting from ComplaintEntry), so a new internal column can never leak by
 * default. Excluded on purpose: request_id, status, admin_notes, resolved_by,
 * resolved_at, updated_at, approaching_at and every other operator field.
 * `reference` is the entry id, which is intentionally the public reference
 * printed on the consumer's copy; it authorizes nothing (there is no public
 * lookup by it).
 */
export type ComplaintConsumerReceipt = {
  reference: string;
  businessUnit: "parfums" | "import";
  createdAt: string;
  dueAt: string;
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
};

export const COMPLAINT_RECEIPT_FIELDS = [
  "reference", "businessUnit", "createdAt", "dueAt", "complaintType", "fullName",
  "documentType", "documentNumber", "address", "phone", "email", "isMinor",
  "guardianFullName", "guardianDocumentNumber", "orderReference", "detail", "consumerRequest",
] as const satisfies ReadonlyArray<keyof ComplaintConsumerReceipt>;

export function toComplaintConsumerReceipt(
  row: ComplaintRow,
  businessUnit: "parfums" | "import",
): ComplaintConsumerReceipt {
  return {
    reference: row.id,
    businessUnit,
    createdAt: row.created_at,
    dueAt: row.due_at,
    complaintType: row.complaint_type as ComplaintConsumerReceipt["complaintType"],
    fullName: row.full_name,
    documentType: row.document_type as ComplaintConsumerReceipt["documentType"],
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
  };
}
