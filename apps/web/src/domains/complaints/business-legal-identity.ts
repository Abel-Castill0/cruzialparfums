import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

const BUSINESS_UNIT_IDS: Record<"parfums" | "import", string> = {
  parfums: "11111111-1111-4111-8111-111111111111",
  import: "22222222-2222-4222-8222-222222222222",
};

export type BusinessLegalIdentity = {
  legalName: string;
  ruc: string;
  address: string;
  claimsEmail: string;
  claimsPhone: string;
  /** Indecopi requires the consumer to be able to identify the provider.
   * false when any of legalName/ruc/address is still blank — this is a
   * genuine external business input, never fabricated here. */
  isComplete: boolean;
};

function mapLegalIdentity(value: Json): BusinessLegalIdentity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, Json | undefined>;
  const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : "");
  const legalName = text("legalName");
  const ruc = text("ruc");
  const address = text("address");
  return {
    legalName,
    ruc,
    address,
    claimsEmail: text("claimsEmail"),
    claimsPhone: text("claimsPhone"),
    isComplete: legalName.trim() !== "" && ruc.trim() !== "" && address.trim() !== "",
  };
}

/** Public read (settings.is_public=true, mirrors readImportPublicContact) —
 * safe with either the anon or the admin client. Returns null only on a
 * genuine read failure/missing row, never a fabricated identity. */
export async function readBusinessLegalIdentity(
  supabase: SupabaseClient<Database>,
  businessUnitCode: "parfums" | "import",
): Promise<BusinessLegalIdentity | null> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("business_unit_id", BUSINESS_UNIT_IDS[businessUnitCode])
    .eq("key", "business_legal")
    .eq("is_public", true)
    .maybeSingle();
  if (error || !data) return null;
  return mapLegalIdentity(data.value);
}
