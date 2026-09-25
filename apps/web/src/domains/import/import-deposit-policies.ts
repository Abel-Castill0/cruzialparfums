import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const IMPORT_BUSINESS_UNIT_ID = "22222222-2222-4222-8222-222222222222";

export type ImportDepositPercentages = {
  new: number | null;
  returning: number | null;
};

/** Public-facing mirror of the exact window/is_active resolution
 * create_import_order_request itself applies — never a hardcoded 50/70, so
 * storefront copy can never diverge from what registering an order actually
 * charges. Uses deposit_policies_public_read (anon-safe RLS), same table the
 * admin customer screen resolves from. */
export async function readImportDepositPercentages(
  supabase: SupabaseClient<Database>,
): Promise<ImportDepositPercentages> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("deposit_policies")
    .select("customer_status, deposit_percentage")
    .eq("business_unit_id", IMPORT_BUSINESS_UNIT_ID)
    .eq("is_active", true)
    .lte("effective_from", nowIso)
    .or(`effective_until.is.null,effective_until.gt.${nowIso}`);

  if (error || !data) return { new: null, returning: null };

  const byStatus = (status: string): number | null => {
    const matches = data.filter((row) => row.customer_status === status);
    return matches.length === 1 ? matches[0]!.deposit_percentage : null;
  };

  return { new: byStatus("new"), returning: byStatus("returning") };
}
