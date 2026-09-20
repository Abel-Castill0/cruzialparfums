import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { mapPostgrestError, type AdminRepositoryResult } from "./products-repository";
import type { PublicContactSettingInput } from "./settings-schema";

export type SettingsRow = Database["public"]["Tables"]["settings"]["Row"];

export type PublicContactSetting = {
  id: string;
  businessUnitId: string;
  updatedAt: string;
  value: PublicContactSettingInput;
};

function toPublicContactSetting(row: SettingsRow): PublicContactSetting | null {
  const value = row.value;
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || typeof (value as Record<string, unknown>).whatsappNumber !== "string"
    || typeof (value as Record<string, unknown>).whatsappDisplay !== "string"
    || typeof (value as Record<string, unknown>).contactEmail !== "string"
    || row.business_unit_id === null
  ) {
    return null;
  }
  const contact = value as unknown as PublicContactSettingInput;
  return {
    id: row.id,
    businessUnitId: row.business_unit_id,
    updatedAt: row.updated_at,
    value: contact,
  };
}

/**
 * Admin Settings data access, scoped to `public_contact` — the one typed
 * key this phase ships (4G1). Every write goes through
 * admin_update_public_contact_setting (supabase/migrations/
 * 20260908170000_admin_settings_public_contact.sql), never a raw
 * `.update()` on `settings`: authenticated has no table-level write grant on
 * that table any more, so a direct PostgREST write would fail, and — more to
 * the point — it would skip the settings_change audit entry the RPC writes
 * atomically with the row.
 */
export class AdminParfumsSettingsRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly businessUnitId: string,
    private readonly businessUnitCode: "parfums" | "import",
  ) {}

  async getPublicContact(): Promise<AdminRepositoryResult<PublicContactSetting | null>> {
    const { data, error } = await this.supabase
      .from("settings")
      .select("*")
      .eq("business_unit_id", this.businessUnitId)
      .eq("key", "public_contact")
      .maybeSingle();

    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data ? toPublicContactSetting(data) : null };
  }

  async updatePublicContact(
    expectedUpdatedAt: string,
    input: PublicContactSettingInput,
  ): Promise<AdminRepositoryResult<PublicContactSetting>> {
    const { data, error } = await this.supabase.rpc("admin_update_public_contact_setting", {
      p_business_unit_code: this.businessUnitCode,
      p_expected_updated_at: expectedUpdatedAt,
      p_whatsapp_number: input.whatsappNumber,
      p_whatsapp_display: input.whatsappDisplay,
      p_contact_email: input.contactEmail,
    });
    if (error) return { ok: false, error: mapPostgrestError(error) };
    const setting = toPublicContactSetting(data as SettingsRow);
    if (!setting) return { ok: false, error: { type: "unknown", message: "malformed setting row" } };
    return { ok: true, data: setting };
  }
}
