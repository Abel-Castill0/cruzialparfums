import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "./domains/catalog/legacy-catalog-repository";
import {
  listProductPurchaseVariants,
  resolveInitialProductVariant,
} from "./domains/catalog/product-purchase";
import { isBottleGiftEligible } from "./domains/catalog/promotion-eligibility";
import { isProductPurchasable } from "./domains/catalog/availability";

// Business-data-contract gate (Fase 2.5, docs/client-decisions.md).
// Guards the specific, client-confirmed corrections against silent
// regressions in a future edit. Do NOT loosen these assertions to make a
// change pass — if a fact changes, update docs/client-decisions.md first.

const srcRoot = dirname(fileURLToPath(import.meta.url));
const SCANNABLE_EXTENSIONS = [".ts", ".tsx", ".css", ".json"];
const SKIP_DIRECTORIES = new Set(["node_modules", ".next"]);

async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      if (SKIP_DIRECTORIES.has(entry.name)) return [];
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(fullPath);
      if (SCANNABLE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        return [fullPath];
      }
      return [];
    }),
  );
  return files.flat();
}

describe("business data contract — regression gate", () => {
  const repository = new LegacyCatalogRepository();

  it("never reintroduces Olva anywhere in the V2 storefront source", async () => {
    const files = await collectSourceFiles(srcRoot);
    // Exclude this file itself, which legitimately names "Olva" as the
    // string it forbids.
    const candidates = files.filter((file) => !file.endsWith("business-data-contract.test.ts"));
    const offenders: string[] = [];
    for (const file of candidates) {
      const content = await readFile(file, "utf8");
      if (/\bolva\b/i.test(content)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("Nitro Red Intensely is Dumont Paris, not Lattafa", () => {
    const product = repository.findByLegacyId("red-intensely");
    expect(product?.brand).toBe("Dumont Paris");
    expect(product?.name).toBe("Nitro Red Intensely");
  });

  it("Supremacy Not Only Intense is Afnan", () => {
    const product = repository.findByLegacyId("supremacy-noi");
    expect(product?.brand).toBe("Afnan");
    expect(product?.name).toBe("Supremacy Not Only Intense");
  });

  it("Réserve Privée is Givenchy, not Armani", () => {
    const product = repository.findByLegacyId("reserve-privee");
    expect(product?.brand).toBe("Givenchy");
    expect(product?.name).toBe("Gentleman Réserve Privée");
  });

  it("Valentino Purple Melancholia is classified as designer, not niche", () => {
    const product = repository.findByLegacyId("purple-melancholia");
    expect(product?.brand).toBe("Valentino");
    expect(product?.type).toBe("designer");
  });

  it("Burberry Brit Intense is not public anywhere", () => {
    expect(repository.findByLegacyId("bir-intense")).toBeNull();
    expect(repository.findBySlug("bir-intense")).toBeNull();
    expect(repository.list().some((p) => p.legacyId === "bir-intense")).toBe(false);
    expect(repository.listWholesale().some((entry) => entry.product.legacyId === "bir-intense")).toBe(false);
  });

  it("Sceptre Malachite keeps its client-verified brand/name", () => {
    // Photo re-verified 2026-09-06 against the client's own bottle photo —
    // already correct, see docs/client-decisions.md.
    const product = repository.findByLegacyId("sceptre-malachite");
    expect(product?.brand).toBe("Maison Alhambra");
    expect(product?.name).toBe("Sceptre Malachite");
  });

  it("discontinued products remain purchasable absent out-of-stock evidence", () => {
    const discontinued = repository
      .list()
      .filter((product) => product.discontinued);
    expect(discontinued.length).toBeGreaterThan(0);
    for (const product of discontinued) {
      expect(isProductPurchasable(product)).toBe(true);
    }
  });

  it("the bottle-gift promotion is eligible on bottle, never on a decant", () => {
    const product = repository.findByLegacyId("9pm");
    expect(product?.bottlePrices).not.toBeNull();
    const variants = listProductPurchaseVariants(product!);
    const decant = resolveInitialProductVariant(product!, "decant");
    const bottle = variants.find((variant) => variant.group === "bottle");
    expect(isBottleGiftEligible(decant.group)).toBe(false);
    expect(isBottleGiftEligible(bottle?.group)).toBe(true);
  });
});
