import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  mapPublicProduct,
  PARFUMS_BUSINESS_UNIT_ID,
  SupabasePublicCatalogRepository,
  type PublicProductRow,
} from "./supabase-public-catalog-repository";

function row(overrides: Partial<PublicProductRow> = {}): PublicProductRow {
  return {
    business_unit_id: PARFUMS_BUSINESS_UNIT_ID,
    legacy_id: "test-parfum",
    slug: "test-parfum",
    brand: "Maison Test",
    name: "Test Parfum",
    description: "Descripción",
    gender: "unisex",
    concentration: "EDP",
    production_status: "discontinued",
    availability_status: "available",
    publication_status: "published",
    archived_at: null,
    is_featured: true,
    featured_rank: 2,
    featured_from: "2026-01-01T00:00:00.000Z",
    featured_until: "2027-01-01T00:00:00.000Z",
    verification_status: "legacy",
    notes: ["Ámbar", "Vainilla"],
    tag: "Árabe",
    product_variants: [
      { id: "bottle-public", label: "Frasco 100 ml", variant_kind: "bottle", size_ml: 100, price_amount: "130.50", currency: "PEN", publication_status: "published", archived_at: null, sort_order: 2, price_verification_status: "legacy" },
      { id: "decant-public", label: "3 ml", variant_kind: "decant", size_ml: 3, price_amount: "12.10", currency: "PEN", publication_status: "published", archived_at: null, sort_order: 0, price_verification_status: "legacy" },
      { id: "decant-draft", label: "5 ml draft", variant_kind: "decant", size_ml: 5, price_amount: "99.99", currency: "PEN", publication_status: "draft", archived_at: null, sort_order: 1, price_verification_status: "legacy" },
    ],
    product_media: [
      { provider: "cloudinary", secure_url: "https://res.cloudinary.com/demo/bottle.webp", alt: "Vista lateral", is_primary: false, sort_order: 1, archived_at: null, product_variant_id: null, media_role: "bottle" },
      { provider: "cloudinary", secure_url: "https://res.cloudinary.com/demo/set.webp", alt: null, is_primary: true, sort_order: 9, archived_at: null, product_variant_id: "decant-public", media_role: "set" },
      { provider: "cloudinary", secure_url: "https://res.cloudinary.com/demo/draft.webp", alt: null, is_primary: false, sort_order: 0, archived_at: null, product_variant_id: "decant-draft", media_role: "additional" },
      { provider: "legacy_static", secure_url: "/img/local.webp", alt: null, is_primary: false, sort_order: 0, archived_at: null, product_variant_id: null, media_role: null },
    ],
    product_categories: [
      { sort_order: 0, category: { business_unit_id: PARFUMS_BUSINESS_UNIT_ID, kind: "commercial_type", slug: "arabic", name: "Árabe", publication_status: "published", archived_at: null } },
      { sort_order: 1, category: { business_unit_id: PARFUMS_BUSINESS_UNIT_ID, kind: "olfactory_family", slug: "ambar", name: "Ámbar", publication_status: "published", archived_at: null } },
    ],
    ...overrides,
  };
}

describe("SupabasePublicCatalogRepository mapping", () => {
  it("refuses draft, hidden, archived and cross-unit rows even before relying on RLS", () => {
    expect(mapPublicProduct(row({ publication_status: "draft" }))).toBeNull();
    expect(mapPublicProduct(row({ publication_status: "hidden" }))).toBeNull();
    expect(mapPublicProduct(row({ archived_at: "2026-01-01T00:00:00Z" }))).toBeNull();
    expect(mapPublicProduct(row({ business_unit_id: "22222222-2222-4222-8222-222222222222" }))).toBeNull();
  });

  it("maps a local published fixture without promoting provenance or conflating production and availability", () => {
    const product = mapPublicProduct(row());
    expect(product).toMatchObject({
      legacyId: "test-parfum",
      slug: "test-parfum",
      brand: "Maison Test",
      name: "Test Parfum",
      type: "arab",
      family: "Ámbar",
      concentration: "EDP",
      discontinued: true,
      availabilityStatus: "available",
      verificationStatus: "legacy",
      decantPrices: { 3: 12.1 },
      bottlePrices: { 100: 130.5 },
    });
    expect(product?.variants.map(({ variantId, priceAmount }) => ({ variantId, priceAmount }))).toEqual([
      { variantId: "decant-3ml", priceAmount: "12.10" },
      { variantId: "bottle-100ml", priceAmount: "130.50" },
    ]);
  });

  it("uses active Cloudinary media only, primary first with stable supplemental order and safe alt", () => {
    const product = mapPublicProduct(row());
    expect(product?.media).toEqual([
      { url: "https://res.cloudinary.com/demo/set.webp", alt: "Maison Test Test Parfum", isPrimary: true, sortOrder: 9 },
      { url: "https://res.cloudinary.com/demo/bottle.webp", alt: "Vista lateral", isPrimary: false, sortOrder: 1 },
    ]);
    expect(product).toMatchObject({
      imageUrl: "https://res.cloudinary.com/demo/set.webp",
      decantImageUrl: "https://res.cloudinary.com/demo/set.webp",
      bottleImageUrl: "https://res.cloudinary.com/demo/bottle.webp",
    });
    expect(product?.decantImageUrl).not.toBe(product?.bottleImageUrl);
  });

  it("falls back safely to the primary image when only one authoritative role exists", () => {
    const product = mapPublicProduct(row({
      product_media: [{
        provider: "cloudinary",
        secure_url: "https://res.cloudinary.com/demo/only-bottle.webp",
        alt: null,
        is_primary: true,
        sort_order: 0,
        archived_at: null,
        product_variant_id: null,
        media_role: "bottle",
      }],
    }));
    expect(product).toMatchObject({
      imageUrl: "https://res.cloudinary.com/demo/only-bottle.webp",
      decantImageUrl: "https://res.cloudinary.com/demo/only-bottle.webp",
      bottleImageUrl: "https://res.cloudinary.com/demo/only-bottle.webp",
    });
  });

  it("exposes missing media honestly and does not add a local fallback", () => {
    const product = mapPublicProduct(row({ product_media: [] }));
    expect(product?.media).toEqual([]);
    expect(product?.imageUrl).toBeNull();
  });

  it("requires public semantic category mappings", () => {
    const badCategory = row();
    badCategory.product_categories[0]!.category = {
      business_unit_id: PARFUMS_BUSINESS_UNIT_ID,
      kind: "commercial_type",
      slug: "invented",
      name: "Inventado",
      publication_status: "published",
      archived_at: null,
    };
    expect(mapPublicProduct(badCategory)).toBeNull();
  });

  it.each([
    ["gender", { gender: "unsupported" }],
    ["production status", { production_status: "retired" }],
    ["availability status", { availability_status: "unknown" }],
  ])("fails closed for malformed %s", (_label, overrides) => {
    expect(mapPublicProduct(row(overrides))).toBeNull();
  });

  it("returns no products for the current zero-published state", () => {
    const repository = SupabasePublicCatalogRepository.fromPublicRows([
      row({ publication_status: "draft" }),
      row({ publication_status: "hidden", legacy_id: "bir-intense" }),
    ]);
    expect(repository.list()).toEqual([]);
    expect(repository.findBySlug("test-parfum")).toBeNull();
  });

  it("loads list/detail/related through one composed public query without N+1", async () => {
    const operations: Array<[string, ...unknown[]]> = [];
    const chain = new Proxy({}, {
      get(_target, property) {
        if (property === "then") {
          return (resolve: (value: unknown) => void) => resolve({ data: [row()], error: null });
        }
        return (...args: unknown[]) => {
          operations.push([String(property), ...args]);
          return chain;
        };
      },
    });
    const client = {
      from(table: string) {
        operations.push(["from", table]);
        return chain;
      },
    } as unknown as SupabaseClient<Database>;

    const repository = await SupabasePublicCatalogRepository.load(client);
    expect(repository.findBySlug("test-parfum")?.legacyId).toBe("test-parfum");
    expect(repository.findByLegacyId("test-parfum")?.slug).toBe("test-parfum");
    expect(repository.listRelated(repository.list()[0]!, 4)).toEqual([]);
    expect(operations.filter(([name]) => name === "from")).toEqual([["from", "products"]]);
    expect(operations).toContainEqual(["eq", "business_unit_id", PARFUMS_BUSINESS_UNIT_ID]);
    expect(operations).toContainEqual(["eq", "publication_status", "published"]);
    expect(operations.some(([name, select]) => name === "select" && String(select).includes("product_variants") && String(select).includes("product_media"))).toBe(true);
  });
});
