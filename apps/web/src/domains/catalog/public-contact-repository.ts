import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { BusinessUnitSettings } from "@/domains/platform/settings";
import { PARFUMS_BUSINESS_UNIT_ID } from "./supabase-public-catalog-repository";

export function mapPublicContact(value: Json): BusinessUnitSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, Json | undefined>;
  const whatsappNumber = record.whatsappNumber;
  const whatsappDisplay = record.whatsappDisplay;
  const contactEmail = record.contactEmail;
  if (typeof whatsappNumber !== "string" || !/^[1-9][0-9]{7,14}$/.test(whatsappNumber)
    || typeof whatsappDisplay !== "string" || whatsappDisplay.trim().length === 0
    || typeof contactEmail !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) return null;
  return { whatsappNumber, whatsappDisplay: whatsappDisplay.trim(), contactEmail };
}

/** Readiness-only public settings reader. Static runtime settings remain active in 4H2A. */
export async function readParfumsPublicContact(
  supabase: SupabaseClient<Database>,
): Promise<BusinessUnitSettings | null> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("business_unit_id", PARFUMS_BUSINESS_UNIT_ID)
    .eq("key", "public_contact")
    .eq("is_public", true)
    .maybeSingle();
  if (error) throw new Error(`Public contact read failed: ${error.message}`);
  return data ? mapPublicContact(data.value) : null;
}
