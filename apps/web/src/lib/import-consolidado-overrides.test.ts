import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPopulationPlan } from "../../../../scripts/lib/import-consolidado-plan.mjs";

const root = resolve(import.meta.dirname, "../../../..");
const reviewed = JSON.parse(readFileSync(resolve(root, "supabase/staging/import/sexto-consolidado-reviewed.json"), "utf8"));
const overrides = JSON.parse(readFileSync(resolve(root, "supabase/staging/import/sexto-consolidado-population-overrides.json"), "utf8"));
const plan = buildPopulationPlan(reviewed, overrides);

describe("4J4B shared override resolution", () => {
  it("keeps every reviewed conflict resolved", () => {
    expect(plan.stats.conflicts).toBe(0);
    expect(plan.skipped.filter((item) => item.reason === "conflicting_source_price_pending_confirmation")).toHaveLength(2);
  });

  it.each(["Accento", "Arabia Heroes"])("splits %s into two canonical products", (name) => {
    const products = plan.products.filter((product) => product.name === name);
    expect(products).toHaveLength(2);
    expect(products[0].canonical_id).not.toBe(products[1].canonical_id);
  });

  it("keeps CDN Preciux IV structure but omits its conflicting offers", () => {
    const product = plan.products.find((item) => item.canonical_id === "scp-9d3551178b73419a");
    expect(product).toBeDefined();
    expect(plan.presentations.filter((item) => item.product_canonical_id === product?.canonical_id).map((item) => item.label)).toEqual(["55ml"]);
    expect(plan.offers.filter((item) => item.product_canonical_id === product?.canonical_id)).toHaveLength(0);
  });

  it("moves the S/330 EDP presentation to Infrared EDP", () => {
    const product = plan.products.find((item) => item.canonical_id === "scp-c65b7b5f87496b06");
    const offers = plan.offers.filter((item) => item.product_canonical_id === product?.canonical_id);
    expect(product?.name).toBe("Infrared EDP");
    expect(offers).toEqual(expect.arrayContaining([expect.objectContaining({ price_amount: "330.00", pres_label: "EDP · 90ml" })]));
  });

  it.each([
    ["scp-e549566330a33aca", ["100ml", "Extrait de Parfum · 100ml"]],
    ["scp-932ad57f8f1f376b", ["EDP · 80ml", "EDT · 80ml"]],
    ["scp-8ee77493b55e5021", ["Retail · 100ml", "Tester · 100ml"]],
  ])("keeps the reviewed structural labels for %s", (canonicalId, labels) => {
    const actual = plan.presentations.filter((item) => item.product_canonical_id === canonicalId).map((item) => item.label);
    expect(actual).toEqual(expect.arrayContaining(labels));
  });

  it("produces the final structural and offer counts without duplicate offer identities", () => {
    expect(plan.products).toHaveLength(844);
    expect(plan.presentations).toHaveLength(912);
    expect(plan.offers).toHaveLength(898);
    const keys = plan.offers.map((offer) => `${offer.product_canonical_id}:${offer.pres_stable_key}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
