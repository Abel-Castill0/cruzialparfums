import { describe, expect, it } from "vitest";
import {
  validateComboCreateForm,
  validateComboItems,
  validateVerificationStatusInput,
  isVerificationStatus,
  isAdminEditableVerificationStatus,
  ADMIN_EDITABLE_VERIFICATION_STATUSES,
  VERIFICATION_STATUS_LABELS,
  toComboCompositionPayload,
  computeComboReadiness,
} from "./combo-schema";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const VARIANT_A = "aaaaaaaa-1111-4111-8111-111111111111";
const VARIANT_B = "bbbbbbbb-1111-4111-8111-111111111111";
const COMBO_VARIANT_A = "cccccccc-1111-4111-8111-111111111111";
const COMBO_VARIANT_B = "dddddddd-1111-4111-8111-111111111111";

describe("validateComboCreateForm", () => {
  it("defaults to pending_reconfirmation when no status is submitted", () => {
    const result = validateComboCreateForm({ productId: PRODUCT_ID });
    expect(result).toEqual({
      ok: true,
      value: { productId: PRODUCT_ID, compositionVerificationStatus: "pending_reconfirmation" },
    });
  });

  it("accepts an explicit client_confirmed status", () => {
    const result = validateComboCreateForm({
      productId: PRODUCT_ID,
      compositionVerificationStatus: "client_confirmed",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.compositionVerificationStatus).toBe("client_confirmed");
  });

  it("rejects a missing or malformed product id", () => {
    for (const productId of [undefined, "", "not-a-uuid"]) {
      const result = validateComboCreateForm({ productId });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.productId).toBeTruthy();
    }
  });

  it("rejects an unknown verification status", () => {
    const result = validateComboCreateForm({ productId: PRODUCT_ID, compositionVerificationStatus: "verified" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.compositionVerificationStatus).toBeTruthy();
  });
});

describe("validateVerificationStatusInput", () => {
  it.each(["pending_reconfirmation", "client_confirmed", "unknown"] as const)(
    "accepts %s",
    (status) => {
      expect(validateVerificationStatusInput(status)).toEqual({ ok: true, value: status });
    },
  );

  it("rejects anything outside the enum", () => {
    const result = validateVerificationStatusInput("confirmed");
    expect(result.ok).toBe(false);
  });

  it("persists official_pdf but never accepts it as a manual Admin value", () => {
    expect(isVerificationStatus("official_pdf")).toBe(true);
    expect(isAdminEditableVerificationStatus("official_pdf")).toBe(false);
    expect(ADMIN_EDITABLE_VERIFICATION_STATUSES).not.toContain("official_pdf");
    expect(validateVerificationStatusInput("official_pdf").ok).toBe(false);
  });
});

describe("isVerificationStatus / VERIFICATION_STATUS_LABELS", () => {
  it("has a Spanish label for every valid status, never the raw enum value", () => {
    for (const status of ["pending_reconfirmation", "client_confirmed", "official_pdf", "unknown"] as const) {
      expect(isVerificationStatus(status)).toBe(true);
      expect(VERIFICATION_STATUS_LABELS[status]).not.toBe(status);
      expect(VERIFICATION_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
    expect(VERIFICATION_STATUS_LABELS.official_pdf).toBe("Confirmado por PDF oficial");
  });
});

describe("validateComboItems", () => {
  it("maps the repository RPC payload with the combo presentation id", () => {
    expect(toComboCompositionPayload([
      { comboProductVariantId: COMBO_VARIANT_A, productVariantId: VARIANT_A, quantity: 2, sortOrder: 0 },
    ])).toEqual([{
      combo_product_variant_id: COMBO_VARIANT_A,
      product_variant_id: VARIANT_A,
      quantity: 2,
      sort_order: 0,
    }]);
  });

  it("normalizes a valid composition", () => {
    const result = validateComboItems([
      { comboProductVariantId: COMBO_VARIANT_A, productVariantId: VARIANT_A, quantity: 2, sortOrder: 0 },
      { comboProductVariantId: COMBO_VARIANT_A, productVariantId: VARIANT_B, quantity: 1, sortOrder: 1 },
    ]);
    expect(result).toEqual({
      ok: true,
      value: [
        { comboProductVariantId: COMBO_VARIANT_A, productVariantId: VARIANT_A, quantity: 2, sortOrder: 0 },
        { comboProductVariantId: COMBO_VARIANT_A, productVariantId: VARIANT_B, quantity: 1, sortOrder: 1 },
      ],
    });
  });

  it("accepts an empty composition (a combo can start with no items)", () => {
    expect(validateComboItems([])).toEqual({ ok: true, value: [] });
  });

  it("defaults sortOrder to array position when omitted", () => {
    const result = validateComboItems([
      { comboProductVariantId: COMBO_VARIANT_A, productVariantId: VARIANT_A, quantity: 1 },
      { comboProductVariantId: COMBO_VARIANT_A, productVariantId: VARIANT_B, quantity: 1 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.sortOrder).toBe(0);
      expect(result.value[1]?.sortOrder).toBe(1);
    }
  });

  it("rejects a non-array payload", () => {
    const result = validateComboItems({ not: "an array" });
    expect(result.ok).toBe(false);
  });

  it("rejects a duplicate variant within the same submission", () => {
    const result = validateComboItems([
      { comboProductVariantId: COMBO_VARIANT_A, productVariantId: VARIANT_A, quantity: 1, sortOrder: 0 },
      { comboProductVariantId: COMBO_VARIANT_A, productVariantId: VARIANT_A, quantity: 2, sortOrder: 1 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["items.1.productVariantId"]).toBeTruthy();
  });

  it("rejects a malformed variant id", () => {
    const result = validateComboItems([{ comboProductVariantId: COMBO_VARIANT_A, productVariantId: "not-a-uuid", quantity: 1, sortOrder: 0 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["items.0.productVariantId"]).toBeTruthy();
  });

  it.each([0, -1, 1.5, Number.NaN, null, undefined, ""])(
    "rejects a quantity of %p (must be a positive integer)",
    (quantity) => {
      const result = validateComboItems([{ comboProductVariantId: COMBO_VARIANT_A, productVariantId: VARIANT_A, quantity, sortOrder: 0 }]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors["items.0.quantity"]).toBeTruthy();
    },
  );

  it("rejects a quantity above the sane maximum", () => {
    const result = validateComboItems([{ comboProductVariantId: COMBO_VARIANT_A, productVariantId: VARIANT_A, quantity: 1000, sortOrder: 0 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["items.0.quantity"]).toBeTruthy();
  });

  it("rejects a non-integer sortOrder", () => {
    const result = validateComboItems([{ comboProductVariantId: COMBO_VARIANT_A, productVariantId: VARIANT_A, quantity: 1, sortOrder: 1.5 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["items.0.sortOrder"]).toBeTruthy();
  });

  it("rejects more than 200 lines", () => {
    const items = Array.from({ length: 201 }, (_, index) => ({
      comboProductVariantId: COMBO_VARIANT_A,
      productVariantId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      quantity: 1,
      sortOrder: index,
    }));
    const result = validateComboItems(items);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.items).toBeTruthy();
  });

  it("requires a valid combo presentation id", () => {
    const result = validateComboItems([
      { comboProductVariantId: "not-a-uuid", productVariantId: VARIANT_A, quantity: 1, sortOrder: 0 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["items.0.comboProductVariantId"]).toBeTruthy();
  });

  it("allows the same ingredient once in different combo presentations", () => {
    const result = validateComboItems([
      { comboProductVariantId: COMBO_VARIANT_A, productVariantId: VARIANT_A, quantity: 1, sortOrder: 0 },
      { comboProductVariantId: COMBO_VARIANT_B, productVariantId: VARIANT_A, quantity: 1, sortOrder: 0 },
    ]);
    expect(result.ok).toBe(true);
  });
});

describe("computeComboReadiness", () => {
  const READY = {
    productPublicationStatus: "published",
    productArchived: false,
    comboArchived: false,
    compositionVerificationStatus: "client_confirmed",
    itemCount: 2,
    hasArchivedItem: false,
  };

  it("returns no blockers when every condition matches app.combo_is_public()", () => {
    expect(computeComboReadiness(READY)).toEqual([]);
  });

  it("accepts official_pdf as a confirmed authority", () => {
    expect(computeComboReadiness({ ...READY, compositionVerificationStatus: "official_pdf" })).toEqual([]);
  });

  it("flags an unconfirmed composition", () => {
    expect(computeComboReadiness({ ...READY, compositionVerificationStatus: "pending_reconfirmation" }))
      .toEqual(["composition_unconfirmed"]);
  });

  it("flags an unpublished product", () => {
    expect(computeComboReadiness({ ...READY, productPublicationStatus: "draft" }))
      .toEqual(["product_unpublished"]);
  });

  it("flags zero items instead of also flagging archived items", () => {
    expect(computeComboReadiness({ ...READY, itemCount: 0, hasArchivedItem: true }))
      .toEqual(["no_items"]);
  });

  it("flags an archived composition item", () => {
    expect(computeComboReadiness({ ...READY, hasArchivedItem: true }))
      .toEqual(["item_archived"]);
  });

  it("stacks multiple simultaneous blockers", () => {
    expect(computeComboReadiness({
      ...READY,
      comboArchived: true,
      productArchived: true,
      productPublicationStatus: "draft",
      compositionVerificationStatus: "unknown",
    })).toEqual(["combo_archived", "product_archived", "product_unpublished", "composition_unconfirmed"]);
  });
});
