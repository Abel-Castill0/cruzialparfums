import { describe, expect, it } from "vitest";
import { PARFUMS_BUSINESS_UNIT_ID } from "@/domains/catalog/supabase-public-catalog-repository";
import {
  PARFUMS_LIST_VIEWS,
  assessParfumsProduct,
  currentParfumsView,
  parfumsViewHref,
  type ParfumsProductDetailInput,
} from "./product-presentation";

const now = "2026-09-28T12:00:00.000Z";

function fixture(overrides: {
  product?: Partial<ParfumsProductDetailInput["product"]>;
  variants?: Partial<ParfumsProductDetailInput["variants"][number]>[];
  categories?: ParfumsProductDetailInput["categories"];
  media?: Partial<ParfumsProductDetailInput["media"][number]>[];
} = {}): ParfumsProductDetailInput {
  const product = {
    id: "p1", business_unit_id: PARFUMS_BUSINESS_UNIT_ID, legacy_id: null, slug: "p1", brand: "Marca", name: "Perfume",
    description: null, short_description: null, gender: "unisex", concentration: null, production_status: "active",
    availability_status: "available", publication_status: "published", archived_at: null, is_featured: false,
    featured_rank: null, featured_from: null, featured_until: null, verification_status: "official_pdf", specs: {},
    sales_mode: "always_available", created_at: now, updated_at: now,
    ...overrides.product,
  } as ParfumsProductDetailInput["product"];
  const variants = (overrides.variants ?? [{}]).map((variant, index) => ({
    id: `v${index}`, product_id: "p1", label: "5 ml", variant_kind: "decant", size_ml: 5, price_amount: 25, currency: "PEN",
    publication_status: "published", archived_at: null, sort_order: index, price_verification_status: "official_pdf",
    sku: null, option_values: {}, created_at: now, updated_at: now, inventory: null,
    ...variant,
  })) as ParfumsProductDetailInput["variants"];
  const categories = overrides.categories ?? ([
    {
      product_id: "p1", category_id: "c1", sort_order: 0, created_at: now,
      category: { id: "c1", business_unit_id: PARFUMS_BUSINESS_UNIT_ID, kind: "commercial_type", slug: "designer", name: "Diseñador", publication_status: "published", archived_at: null },
    },
  ] as unknown as ParfumsProductDetailInput["categories"]);
  const media = (overrides.media ?? [{}]).map((item, index) => ({
    id: `m${index}`, product_id: "p1", provider: "cloudinary", secure_url: "https://res.cloudinary.com/x.jpg", alt: null,
    is_primary: index === 0, sort_order: index, archived_at: null, product_variant_id: null, metadata: {},
    ...item,
  })) as ParfumsProductDetailInput["media"];
  return { product, variants, categories, media };
}

describe("assessParfumsProduct", () => {
  it("uses the storefront mapper: a complete published product is visible and purchasable", () => {
    const result = assessParfumsProduct(fixture());
    expect(result.visibleInStore).toBe(true);
    expect(result.purchasable).toBe(true);
    expect(result.headline).toBe("Visible en la tienda");
    expect(result.nextCheck).toBeNull();
  });

  it("out of stock stays visible but not purchasable", () => {
    const result = assessParfumsProduct(fixture({ product: { availability_status: "out_of_stock" } }));
    expect(result.visibleInStore).toBe(true);
    expect(result.purchasable).toBe(false);
    expect(result.consequence).toMatch(/no está disponible para compra/);
  });

  it("a draft is not visible and the next step is publication", () => {
    const result = assessParfumsProduct(fixture({ product: { publication_status: "draft" } }));
    expect(result.visibleInStore).toBe(false);
    expect(result.consequence).toBe("Los clientes todavía no pueden verlo.");
    expect(result.nextCheck?.key).toBe("publication");
  });

  it("explains a missing commercial type as a blocking check that matches the storefront verdict", () => {
    const result = assessParfumsProduct(fixture({ categories: [] }));
    expect(result.visibleInStore).toBe(false);
    expect(result.nextCheck?.key).toBe("type");
    expect(result.unexplained).toBe(false);
  });

  it("requires a published decant with size and price", () => {
    const bottleOnly = assessParfumsProduct(fixture({ variants: [{ variant_kind: "bottle", size_ml: 100 }] }));
    expect(bottleOnly.visibleInStore).toBe(false);
    expect(bottleOnly.nextCheck?.key).toBe("variants");
    const none = assessParfumsProduct(fixture({ variants: [] as never }));
    expect(none.checks.find((check) => check.key === "variants")?.state).toBe("not_started");
  });

  it("treats photos and reference prices as advisory only", () => {
    const result = assessParfumsProduct(fixture({ media: [] as never, variants: [{ price_verification_status: "provisional_market" }] }));
    expect(result.visibleInStore).toBe(true);
    const media = result.checks.find((check) => check.key === "media")!;
    expect(media.blocking).toBe(false);
    expect(media.state).toBe("not_started");
    expect(result.checks.find((check) => check.key === "prices")?.state).toBe("attention");
  });

  it("keeps an owner-selected provisional price visible as unconfirmed without blocking the store", () => {
    const result = assessParfumsProduct(fixture({ variants: [{ price_verification_status: "owner_selected_provisional" }] }));
    expect(result.visibleInStore).toBe(true);
    const prices = result.checks.find((check) => check.key === "prices")!;
    expect(prices.blocking).toBe(false);
    expect(prices.state).toBe("attention");
    expect(prices.detail).toMatch(/precio referencial sin confirmar/);
  });

  it("never claims a reason it cannot identify", () => {
    const result = assessParfumsProduct(fixture({ product: { business_unit_id: "other-unit" } }));
    expect(result.visibleInStore).toBe(false);
    expect(result.unexplained).toBe(true);
    expect(result.consequence).toMatch(/no pudimos identificar/);
  });
});

describe("Parfums list views", () => {
  it("maps views onto existing URL filters only", () => {
    expect(PARFUMS_LIST_VIEWS.map((view) => view.key)).toEqual(["all", "published", "draft", "out_of_stock", "archived"]);
    expect(currentParfumsView({ q: "x" })).toBe("all");
    expect(currentParfumsView({ availability: "out_of_stock" })).toBe("out_of_stock");
    expect(currentParfumsView({ publication: "published", availability: "out_of_stock" })).toBeNull();
  });

  it("keeps search and advanced filters, swaps the view and resets the page", () => {
    const draft = PARFUMS_LIST_VIEWS.find((view) => view.key === "draft")!;
    expect(parfumsViewHref("/admin/parfums/productos", { q: "oud", production: "active", availability: "available", page: "3" }, draft))
      .toBe("/admin/parfums/productos?q=oud&production=active&publication=draft");
  });
});
