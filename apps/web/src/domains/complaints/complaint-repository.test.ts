import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ComplaintFormInput } from "./complaint-schema";
import { COMPLAINT_RECEIPT_FIELDS } from "./complaint-receipt";
import { submitComplaintEntry } from "./complaint-repository";

describe("atomic complaint outcome", () => {
  it.each([true, false])("uses the database creation outcome (%s) and excludes operator data", async created => {
    const row = { id: "receipt", business_unit_id: "unit", request_id: "private-attempt", full_name: "Original consumer",
      created_at: "2026-09-26T00:00:00Z", due_at: "2026-10-16T00:00:00Z", complaint_type: "reclamo",
      document_type: "dni", document_number: "12345678", address: "Synthetic address", phone: "999000053",
      email: "race@example.test", is_minor: false, guardian_full_name: null, guardian_document_number: null,
      order_reference: null, detail: "Original detail", consumer_request: "Original remedy",
      admin_notes: "PRIVATE", resolved_by: "PRIVATE", status: "resolved", sla_rule: "PRIVATE", worker_metadata: "PRIVATE" };
    const rpc = vi.fn().mockResolvedValue({ data: [{ entry: row, created }], error: null });
    const from = vi.fn(() => { throw new Error("The outcome must not depend on an unlocked existence read"); });
    const client = { rpc, from } as unknown as SupabaseClient<Database>;
    const result = await submitComplaintEntry(client, "parfums", "server-derived", {} as ComplaintFormInput);
    expect(rpc).toHaveBeenCalledWith("public_submit_complaint_entry_v2", expect.objectContaining({ p_request_id: "server-derived" }));
    expect(from).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.created).toBe(created);
      expect(Object.keys(result.data).sort()).toEqual([...COMPLAINT_RECEIPT_FIELDS].sort());
      expect(JSON.stringify(result.data)).not.toContain("PRIVATE");
      expect(result.data.fullName).toBe("Original consumer");
    }
  });
  it("fails closed if persistence does not return an atomic result", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } as unknown as SupabaseClient<Database>;
    expect((await submitComplaintEntry(client, "import", "server-derived", {} as ComplaintFormInput)).ok).toBe(false);
  });
});
