import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  WHOLESALE_ATTENTION_STATUSES,
  WHOLESALE_ELIGIBILITY_LABELS,
  WHOLESALE_ELIGIBILITY_STATUSES,
  currentWholesaleView,
  parseWholesaleEligibilityParam,
  policyMeaning,
  storefrontExclusionReason,
  summarizePolicy,
} from "./wholesale-presentation";

const policy = {
  commercial_type: "arabic",
  min_quantity: 12,
  discount_amount: 3.5,
  currency: "PEN",
  is_active: true,
};

describe("wholesale eligibility labels", () => {
  it("humanizes exactly the view's existing statuses", () => {
    expect(WHOLESALE_ELIGIBILITY_LABELS).toEqual({
      eligible: "Listo para Mayorista",
      missing_classification: "Falta tipo comercial",
      ambiguous_classification: "Revisa la clasificación",
      unsupported_classification: "Tipo comercial no compatible",
      policy_disabled: "Política desactivada",
    });
  });

  it("'attention' is the non-eligible statuses and nothing else", () => {
    expect([...WHOLESALE_ATTENTION_STATUSES, "eligible"].sort()).toEqual([...WHOLESALE_ELIGIBILITY_STATUSES].sort());
  });
});

describe("eligibility filter param", () => {
  it("keeps existing ?eligibility=<status> deep links", () => {
    expect(parseWholesaleEligibilityParam("policy_disabled")).toEqual({ kind: "status", status: "policy_disabled" });
    expect(currentWholesaleView(parseWholesaleEligibilityParam("policy_disabled"))).toBeNull();
    expect(currentWholesaleView(parseWholesaleEligibilityParam("eligible"))).toBe("eligible");
  });

  it("adds the attention group and ignores unknown values", () => {
    expect(currentWholesaleView(parseWholesaleEligibilityParam("attention"))).toBe("attention");
    expect(parseWholesaleEligibilityParam("qualified")).toEqual({ kind: "none" });
    expect(currentWholesaleView(parseWholesaleEligibilityParam(undefined))).toBe("all");
  });
});

describe("summarizePolicy", () => {
  it("reports the stored values, whatever they are", () => {
    const summary = summarizePolicy(policy, "arabic");
    expect(summary).toMatchObject({ complete: true, label: "Árabe", active: true, minQuantity: 12 });
    expect(summary.complete && summary.discountText).toMatch(/3\.50/);
    expect(policyMeaning(summary)).toMatch(/al menos 12 frascos Árabe/);
  });

  it("never manufactures a threshold or discount for missing data", () => {
    const summary = summarizePolicy({ ...policy, min_quantity: null, discount_amount: null }, "niche");
    expect(summary.complete).toBe(false);
    expect(!summary.complete && summary.missing).toEqual(["pedido mínimo", "descuento por frasco"]);
    const meaning = policyMeaning(summary);
    expect(meaning).not.toMatch(/\d/);
  });

  it("explains a disabled rule by its commercial consequence", () => {
    expect(policyMeaning(summarizePolicy({ ...policy, is_active: false }, "arabic"))).toMatch(/no reciben precio mayorista/);
  });
});

describe("storefrontExclusionReason", () => {
  const row = {
    product_publication_status: "published",
    variant_publication_status: "published",
    product_archived_at: null,
    variant_archived_at: null,
  };

  it("never claims a bottle is visible; only reports proven exclusions", () => {
    expect(storefrontExclusionReason(row)).toBeNull();
    expect(storefrontExclusionReason({ ...row, product_publication_status: "draft" })).toBe("producto sin publicar");
    expect(storefrontExclusionReason({ ...row, variant_archived_at: "2026-01-01T00:00:00Z" })).toBe("frasco archivado");
  });
});

describe("mayorista UI contracts", () => {
  const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
  const sources = [
    read("../../app/admin/parfums/mayorista/page.tsx"),
    read("../../app/admin/import/mayorista/page.tsx"),
    read("../../app/admin/import/mayorista/actions.ts"),
    read("./wholesale-presentation.ts"),
  ];

  it("has no hardcoded business fallback for thresholds or discounts", () => {
    for (const source of sources) {
      expect(source).not.toMatch(/\?\?\s*\d/);
      expect(source).not.toMatch(/\|\|\s*\d{2}/);
      expect(source).not.toMatch(/\b40\b/);
    }
  });

  it("keeps the Parfums admin route pointed at the Import workspace", () => {
    expect(sources[0]).toMatch(/redirect\("\/admin\/import\/mayorista"/);
  });

  it("scopes changes to Import membership and checks the policy's current version", () => {
    expect(sources[2]).toMatch(/requireUnitAdmin\("import"\)/);
    expect(sources[2]).toMatch(/expectedUpdatedAt/);
    expect(sources[2]).toMatch(/business_unit_id", auth\.membership\.businessUnitId/);
    expect(sources[2]).toMatch(/admin_update_wholesale_policy/);
  });
});
