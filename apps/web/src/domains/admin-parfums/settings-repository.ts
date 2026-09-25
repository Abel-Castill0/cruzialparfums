import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { mapPostgrestError, type AdminRepositoryResult } from "./products-repository";
import type { BusinessLegalSettingInput, PublicContactSettingInput } from "./settings-schema";

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

export type BusinessLegalSetting = {
  id: string;
  businessUnitId: string;
  updatedAt: string;
  value: BusinessLegalSettingInput;
};

function toBusinessLegalSetting(row: SettingsRow): BusinessLegalSetting | null {
  const value = row.value;
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || typeof (value as Record<string, unknown>).legalName !== "string"
    || typeof (value as Record<string, unknown>).ruc !== "string"
    || typeof (value as Record<string, unknown>).address !== "string"
    || typeof (value as Record<string, unknown>).claimsEmail !== "string"
    || typeof (value as Record<string, unknown>).claimsPhone !== "string"
    || typeof (value as Record<string, unknown>).exchangePolicy !== "string"
    || typeof (value as Record<string, unknown>).paymentMethodsNote !== "string"
    || row.business_unit_id === null
  ) {
    return null;
  }
  return {
    id: row.id,
    businessUnitId: row.business_unit_id,
    updatedAt: row.updated_at,
    value: value as unknown as BusinessLegalSettingInput,
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

  async getBusinessLegal(): Promise<AdminRepositoryResult<BusinessLegalSetting | null>> {
    const { data, error } = await this.supabase
      .from("settings")
      .select("*")
      .eq("business_unit_id", this.businessUnitId)
      .eq("key", "business_legal")
      .maybeSingle();

    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data ? toBusinessLegalSetting(data) : null };
  }

  async updateBusinessLegal(
    expectedUpdatedAt: string,
    input: BusinessLegalSettingInput,
  ): Promise<AdminRepositoryResult<BusinessLegalSetting>> {
    const { data, error } = await this.supabase.rpc("admin_update_business_legal_setting", {
      p_business_unit_code: this.businessUnitCode,
      p_expected_updated_at: expectedUpdatedAt,
      p_legal_name: input.legalName,
      p_ruc: input.ruc,
      p_address: input.address,
      p_claims_email: input.claimsEmail,
      p_claims_phone: input.claimsPhone,
      p_exchange_policy: input.exchangePolicy,
      p_payment_methods_note: input.paymentMethodsNote,
    });
    if (error) return { ok: false, error: mapPostgrestError(error) };
    const setting = toBusinessLegalSetting(data as SettingsRow);
    if (!setting) return { ok: false, error: { type: "unknown", message: "malformed setting row" } };
    return { ok: true, data: setting };
  }
}
