import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "../catalog/legacy-catalog-repository";
import type { CatalogProduct } from "../catalog/types";
import { buildCustomComboMessage } from "../whatsapp/parfums-message-builder";
import {
  addComboLine,
  availableComboSizes,
  calculateComboLinesTotal,
  canSendCombo,
  createComboLine,
  defaultComboSize,
  filterComboProducts,
  listComboEligibleProducts,
  removeComboLine,
  resolveComboLines,
  setComboLineSize,
  type ComboLine,
} from "./combo-builder";

function fakeProduct(overrides: Partial<CatalogProduct>): CatalogProduct {
  return {
    productId: null,
    legacyId: null,
    slug: "fake-product",
    brand: "Fake",
    name: "Fake Product",
    gender: "unisex",
    type: "niche",
    family: "",
    concentration: "",
    decantPrices: { "3": 10, "5": 15, "10": 25 },
    bottlePrices: null,
    notes: [],
    tag: "",
    description: "",
    discontinued: false,
    bestseller: false,
    hidden: false,
    availabilityStatus: "available",
    isFeatured: false,
    featuredRank: null,
    featuredFrom: null,
    featuredUntil: null,
    imageUrl: null,
    decantImageUrl: null,
    bottleImageUrl: null,
    imageAlt: "",
    verificationStatus: "client_confirmed",
    bottlePricingVerificationStatus: null,
    comboCompositionVerificationStatus: null,
    comboContent: null,
    comboPresentations: [],
    variants: [],
    media: [],
    ...overrides,
  };
}

describe("custom combo rules", () => {
  const eligible = listComboEligibleProducts(new LegacyCatalogRepository().list());

  it("offers active fragrances only", () => {
    // 95 visible fragrances (96 active minus hidden `bir-intense`) minus the
    // 3 discontinued = 92 eligible for the combo builder.
    expect(eligible).toHaveLength(92);
    expect(eligible.some((product) => product.type === "combo" || product.discontinued)).toBe(false);
  });

  it("searches brand, name and family", () => {
    expect(filterComboProducts(eligible, "khamrah")).toHaveLength(4);
    expect(filterComboProducts(eligible, "gourmand").length).toBeGreaterThan(0);
  });

  it("enforces the legacy 3-6 range by item count", () => {
    expect(canSendCombo(2)).toBe(false);
    expect(canSendCombo(3)).toBe(true);
    expect(canSendCombo(6)).toBe(true);
    expect(canSendCombo(7)).toBe(false);
  });

  it("computes an exact total when every line uses the same 3 ml size", () => {
    let lines: ComboLine[] = [];
    lines = addComboLine(lines, "khamrah-clasico");
    lines = addComboLine(lines, "khamrah-qahwa");
    lines = addComboLine(lines, "khamrah-dukhan");
    const resolved = resolveComboLines(eligible, lines);
    expect(resolved.every((entry) => entry.line.size === 3)).toBe(true);
    expect(calculateComboLinesTotal(resolved)).toBe(12 + 12 + 12);
  });

  it("computes an exact total with mixed 3/5/10 ml sizes per line", () => {
    let lines: ComboLine[] = [];
    lines = addComboLine(lines, "khamrah-clasico");
    lines = addComboLine(lines, "khamrah-qahwa");
    lines = addComboLine(lines, "yara-candy");
    lines = setComboLineSize(lines, "khamrah-clasico", 10);
    lines = setComboLineSize(lines, "khamrah-qahwa", 5);
    // yara-candy left at its default (3 ml) — untouched.
    const resolved = resolveComboLines(eligible, lines);
    function entryFor(legacyId: string) {
      const entry = resolved.find((candidate) => candidate.product.legacyId === legacyId);
      if (!entry) throw new Error(`missing resolved line for ${legacyId}`);
      return entry;
    }
    expect(entryFor("khamrah-clasico").line.size).toBe(10);
    expect(entryFor("khamrah-clasico").price).toBe(26);
    expect(entryFor("khamrah-qahwa").line.size).toBe(5);
    expect(entryFor("khamrah-qahwa").price).toBe(16);
    expect(entryFor("yara-candy").line.size).toBe(3);
    expect(entryFor("yara-candy").price).toBe(11);
    expect(calculateComboLinesTotal(resolved)).toBe(26 + 16 + 11);
  });

  it("changing one line's size never changes any other line", () => {
    let lines: ComboLine[] = [];
    lines = addComboLine(lines, "khamrah-clasico");
    lines = addComboLine(lines, "khamrah-qahwa");
    lines = addComboLine(lines, "khamrah-dukhan");
    lines = setComboLineSize(lines, "khamrah-clasico", 10);
    const untouched = lines.filter((line) => line.productId !== "khamrah-clasico");
    expect(untouched.every((line) => line.size === 3)).toBe(true);
    expect(lines.find((line) => line.productId === "khamrah-clasico")?.size).toBe(10);
  });

  it("A=10ml, B=3ml, C=5ml; changing only B to 10ml leaves A and C exactly as they were", () => {
    // Exact real-world scenario requested for QA: three distinct sizes up
    // front, then a single line change, verified end to end including the
    // WhatsApp message.
    let lines: ComboLine[] = [];
    lines = addComboLine(lines, "khamrah-clasico"); // A
    lines = addComboLine(lines, "khamrah-qahwa"); // B
    lines = addComboLine(lines, "yara-candy"); // C
    lines = setComboLineSize(lines, "khamrah-clasico", 10); // A = 10ml
    lines = setComboLineSize(lines, "khamrah-qahwa", 3); // B = 3ml (already default, explicit)
    lines = setComboLineSize(lines, "yara-candy", 5); // C = 5ml

    // Now change only B.
    lines = setComboLineSize(lines, "khamrah-qahwa", 10);

    const resolved = resolveComboLines(eligible, lines);
    function entryFor(legacyId: string) {
      const entry = resolved.find((candidate) => candidate.product.legacyId === legacyId);
      if (!entry) throw new Error(`missing resolved line for ${legacyId}`);
      return entry;
    }
    expect(entryFor("khamrah-clasico").line.size).toBe(10); // A unchanged
    expect(entryFor("khamrah-qahwa").line.size).toBe(10); // B changed
    expect(entryFor("yara-candy").line.size).toBe(5); // C unchanged
    expect(entryFor("khamrah-clasico").price).toBe(26);
    expect(entryFor("khamrah-qahwa").price).toBe(26);
    expect(entryFor("yara-candy").price).toBe(15);

    const message = buildCustomComboMessage({
      storeName: "Cruzial Parfums",
      lines: resolved.map((entry) => ({
        brand: entry.product.brand,
        name: entry.product.name,
        subtotal: entry.price,
        variantLabel: `${entry.line.size} ml`,
      })),
      total: calculateComboLinesTotal(resolved),
    });
    expect(message).toContain("Khamrah Clásico (10 ml) — S/ 26.00");
    expect(message).toContain("Khamrah Qahwa (10 ml) — S/ 26.00");
    expect(message).toContain("Yara Candy (5 ml) — S/ 15.00");
    expect(message).toContain("TOTAL ESTIMADO: S/ 67.00");
  });

  it("removes exactly one line without touching the others", () => {
    let lines: ComboLine[] = [];
    lines = addComboLine(lines, "khamrah-clasico");
    lines = addComboLine(lines, "khamrah-qahwa");
    lines = addComboLine(lines, "khamrah-dukhan");
    lines = removeComboLine(lines, "khamrah-qahwa");
    expect(lines.map((line) => line.productId)).toEqual([
      "khamrah-clasico",
      "khamrah-dukhan",
    ]);
  });

  it("never adds the same product twice or beyond the 6-item maximum", () => {
    let lines: ComboLine[] = [];
    lines = addComboLine(lines, "khamrah-clasico");
    lines = addComboLine(lines, "khamrah-clasico");
    expect(lines).toHaveLength(1);

    lines = [];
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    for (const id of ids) lines = addComboLine(lines, id);
    expect(lines).toHaveLength(6);
    expect(lines.map((line) => line.productId)).not.toContain("g");
  });
});

describe("resolveComboLines with a Supabase-sourced product (no legacyId)", () => {
  it("resolves by cartIdentity, not by the (null) legacyId", () => {
    // Any product created after the Supabase cutover has legacyId === null
    // and only a real productId (UUID). Keying the lookup map by legacyId
    // would collide every such product onto the same `null` key and drop
    // every line for it — this is the regression this test guards against.
    const product = fakeProduct({ productId: "11111111-1111-4111-8111-000000000099", legacyId: null });
    let lines: ComboLine[] = [];
    lines = addComboLine(lines, product.productId!, defaultComboSize(product)!);
    const resolved = resolveComboLines([product], lines);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.product.productId).toBe(product.productId);
    expect(resolved[0]!.price).toBe(10);
  });
});

describe("availableComboSizes / defaultComboSize", () => {
  it("only lists sizes with a confirmed decant price", () => {
    const product = fakeProduct({ decantPrices: { "5": 15 } });
    expect(availableComboSizes(product)).toEqual([5]);
    expect(defaultComboSize(product)).toBe(5);
  });

  it("never lets a product be priced at S/ 0.00 for a size it doesn't sell", () => {
    // Product only sells 5ml and 10ml decants — no 3ml. Defaulting to the
    // global COMBO_SIZES[0] (3ml) would resolve to decantPrices["3"] ?? 0,
    // silently showing a free item.
    const product = fakeProduct({ legacyId: "fake-5-10-only", decantPrices: { "5": 20, "10": 35 } });
    const size = defaultComboSize(product);
    let lines: ComboLine[] = [];
    lines = addComboLine(lines, product.productId ?? product.legacyId!, size!);
    const resolved = resolveComboLines([product], lines);
    expect(resolved[0]!.price).toBeGreaterThan(0);
  });

  it("has no default when a product has no supported priced size", () => {
    const product = fakeProduct({ decantPrices: {} });
    expect(availableComboSizes(product)).toEqual([]);
    expect(defaultComboSize(product)).toBeNull();
    expect(listComboEligibleProducts([product])).toEqual([]);
  });

  it("excludes a 2 ml-only product and fails closed before a zero-price WhatsApp line", () => {
    const product = fakeProduct({ productId: "11111111-1111-4111-8111-000000000099", decantPrices: { "2": 9 } });
    expect(availableComboSizes(product)).toEqual([]);
    expect(defaultComboSize(product)).toBeNull();
    expect(listComboEligibleProducts([product])).toEqual([]);

    const attempted = [createComboLine(product.productId!, 3)];
    const resolved = resolveComboLines([product], attempted);
    expect(resolved).toEqual([]);
    expect(canSendCombo(resolved.length)).toBe(false);
    const message = buildCustomComboMessage({
      storeName: "Cruzial Parfums",
      lines: resolved.map((entry) => ({
        brand: entry.product.brand, name: entry.product.name,
        subtotal: entry.price, variantLabel: `${entry.line.size} ml`,
      })),
      total: calculateComboLinesTotal(resolved),
    });
    expect(message).not.toContain(product.name);
    expect(message).not.toContain("3 ml");
  });
});
