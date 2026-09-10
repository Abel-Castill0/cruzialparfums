import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));
vi.mock("@/domains/admin-parfums/products-repository", () => ({
  mapPostgrestError: (error: { message: string }) => ({ type: "unknown", message: error.message }),
}));

import { AdminImportCampaignProductsRepository } from "./campaign-products-repository";

const UNIT_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_ID = "99003000-0000-4000-8000-000000000001";

function readRow(priceAmount: unknown, sortOrder: number) {
  return {
    id: `row-${sortOrder}`,
    product_id: "product-id",
    product_variant_id: null,
    price_amount: priceAmount,
    currency: "PEN",
    availability_status: "available",
    sort_order: sortOrder,
    product_name: "Product",
    product_slug: "product",
    product_brand: null,
    product_archived_at: null,
    product_publication_status: "published",
    variant_label: null,
    variant_archived_at: null,
    variant_publication_status: null,
  };
}

describe("AdminImportCampaignProductsRepository", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("reads authoritative DB money only as canonical decimal text", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: ["0.01", "16.00", "16.50", "129.90", "9999999999.99"].map(readRow),
      error: null,
    });
    const repository = new AdminImportCampaignProductsRepository(
      { rpc } as unknown as SupabaseClient<Database>,
      UNIT_ID,
    );

    const result = await repository.getCampaignProducts(CAMPAIGN_ID);

    expect(rpc).toHaveBeenCalledWith("admin_get_import_campaign_products", { p_campaign_id: CAMPAIGN_ID });
    expect(result.ok && result.data.map((item) => item.priceAmount)).toEqual([
      "0.01",
      "16.00",
      "16.50",
      "129.90",
      "9999999999.99",
    ]);
  });

  it("fails the read when PostgREST supplies a JS number instead of DB text", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [readRow(129.9, 0)], error: null });
    const repository = new AdminImportCampaignProductsRepository(
      { rpc } as unknown as SupabaseClient<Database>,
      UNIT_ID,
    );

    await expect(repository.getCampaignProducts(CAMPAIGN_ID)).resolves.toMatchObject({
      ok: false,
      error: { type: "unknown" },
    });
  });

  it("keeps picker queries bounded, Import-scoped, and excludes archived lifecycle rows", async () => {
    const calls: [string, ...unknown[]][] = [];
    const builder = {
      select: (...args: unknown[]) => { calls.push(["select", ...args]); return builder; },
      eq: (...args: unknown[]) => { calls.push(["eq", ...args]); return builder; },
      is: (...args: unknown[]) => { calls.push(["is", ...args]); return builder; },
      neq: (...args: unknown[]) => { calls.push(["neq", ...args]); return builder; },
      order: (...args: unknown[]) => { calls.push(["order", ...args]); return builder; },
      limit: (...args: unknown[]) => { calls.push(["limit", ...args]); return builder; },
      then: (resolve: (value: unknown) => void) => resolve({
        data: [{
          id: "product-id",
          name: "Product",
          slug: "product",
          brand: null,
          publication_status: "published",
          product_variants: [
            { id: "variant-published", label: "Published", size_ml: null, publication_status: "published", archived_at: null },
            { id: "variant-draft", label: "Draft", size_ml: null, publication_status: "draft", archived_at: null },
            { id: "variant-archived", label: "Archived", size_ml: null, publication_status: "archived", archived_at: null },
          ],
        }],
        error: null,
      }),
    };
    const supabase = { from: vi.fn(() => builder) } as unknown as SupabaseClient<Database>;
    const repository = new AdminImportCampaignProductsRepository(supabase, UNIT_ID);

    const result = await repository.searchEligibleProducts({ query: "", limit: 500 });

    expect(calls).toContainEqual(["eq", "business_unit_id", UNIT_ID]);
    expect(calls).toContainEqual(["is", "archived_at", null]);
    expect(calls).toContainEqual(["neq", "publication_status", "archived"]);
    expect(calls).toContainEqual(["is", "product_variants.archived_at", null]);
    expect(calls).toContainEqual(["neq", "product_variants.publication_status", "archived"]);
    expect(calls).toContainEqual(["limit", 50]);
    expect(result.ok && result.data[0]?.variants.map((variant) => variant.publicationStatus)).toEqual([
      "published",
      "draft",
    ]);
  });
});
