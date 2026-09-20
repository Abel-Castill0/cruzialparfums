import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { type AdminRepositoryResult, mapPostgrestError } from "./products-repository";

/**
 * Admin Parfums media data access (Phase 4F1).
 *
 * Every write goes through the `public.admin_*_media` RPC functions from
 * supabase/migrations/20260908120000_admin_parfums_media_mutations.sql —
 * never a raw `.insert()`/`.update()` on product_media — so the "one active
 * primary per product" invariant, variant-belongs-to-product checks, and
 * audit trail all stay server-enforced. Reads use plain PostgREST queries:
 * RLS already scopes them correctly (product_media_admin_read).
 */

type MediaRow = Database["public"]["Tables"]["product_media"]["Row"];

/** See the identical comment on this type in products-repository.ts:
 * `supabase gen types` widens a nullable RPC parameter's TS type only when
 * the SQL signature gives it a default — admin_update_media's p_alt/
 * p_variant_id have no `default null` (a full-replace update always sends
 * both), so the generated Args type is too narrow for a value that clears
 * either field. Postgres itself accepts null for both without complaint. */
type RpcArgsWithNulls<T> = { [K in keyof T]: T[K] | null };

export type RegisterMediaInput = {
  productId: string;
  variantId: string | null;
  provider: "cloudinary" | "legacy_static";
  publicId: string | null;
  secureUrl: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  format: string | null;
  alt: string | null;
  setPrimary: boolean;
};

export class AdminParfumsMediaRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async listForProduct(productId: string): Promise<AdminRepositoryResult<MediaRow[]>> {
    const { data, error } = await this.supabase
      .from("product_media")
      .select("*")
      .eq("product_id", productId)
      .order("archived_at", { ascending: true, nullsFirst: true })
      .order("sort_order", { ascending: true });

    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data ?? [] };
  }

  async register(input: RegisterMediaInput): Promise<AdminRepositoryResult<MediaRow>> {
    const { data, error } = await this.supabase.rpc("admin_register_media", {
      p_product_id: input.productId,
      p_secure_url: input.secureUrl,
      p_provider: input.provider,
      ...(input.variantId ? { p_variant_id: input.variantId } : {}),
      ...(input.publicId ? { p_public_id: input.publicId } : {}),
      ...(input.width !== null ? { p_width: input.width } : {}),
      ...(input.height !== null ? { p_height: input.height } : {}),
      ...(input.bytes !== null ? { p_bytes: input.bytes } : {}),
      ...(input.format ? { p_format: input.format } : {}),
      ...(input.alt ? { p_alt: input.alt } : {}),
      p_set_primary: input.setPrimary,
    });

    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data as MediaRow };
  }

  async update(
    mediaId: string,
    expectedUpdatedAt: string,
    alt: string | null,
    variantId: string | null,
  ): Promise<AdminRepositoryResult<MediaRow>> {
    type Args = RpcArgsWithNulls<Database["public"]["Functions"]["admin_update_media"]["Args"]>;
    const payload: Args = {
      p_media_id: mediaId,
      p_expected_updated_at: expectedUpdatedAt,
      p_alt: alt,
      p_variant_id: variantId,
    };
    const { data, error } = await this.supabase.rpc(
      "admin_update_media",
      payload as Database["public"]["Functions"]["admin_update_media"]["Args"],
    );
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data as MediaRow };
  }

  async setPrimary(mediaId: string, expectedUpdatedAt: string): Promise<AdminRepositoryResult<MediaRow>> {
    const { data, error } = await this.supabase.rpc("admin_set_media_primary", {
      p_media_id: mediaId,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data as MediaRow };
  }

  async archive(mediaId: string, expectedUpdatedAt: string): Promise<AdminRepositoryResult<MediaRow>> {
    const { data, error } = await this.supabase.rpc("admin_archive_media", {
      p_media_id: mediaId,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data as MediaRow };
  }

  async restore(mediaId: string, expectedUpdatedAt: string): Promise<AdminRepositoryResult<MediaRow>> {
    const { data, error } = await this.supabase.rpc("admin_restore_media", {
      p_media_id: mediaId,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data as MediaRow };
  }

  async reorder(
    productId: string,
    items: { id: string; sortOrder: number }[],
  ): Promise<AdminRepositoryResult<MediaRow[]>> {
    const { data, error } = await this.supabase.rpc("admin_reorder_media", {
      p_product_id: productId,
      p_items: items.map((item) => ({ id: item.id, sort_order: item.sortOrder })),
    });
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: (data ?? []) as MediaRow[] };
  }
}
