import { describe, expect, it } from "vitest";
import { isValidExpectedTimestamp, validateCategoryForm } from "./category-schema";

const valid = {
  kind: "commercial_type",
  slug: "perfumes-de-nicho",
  name: "Perfumes de nicho",
  description: "Selección editorial",
  parentId: "11111111-1111-4111-8111-111111111111",
  publicationStatus: "draft",
  sortOrder: "10",
};

describe("validateCategoryForm", () => {
  it("normalizes a valid full category payload", () => {
    expect(validateCategoryForm(valid)).toEqual({
      ok: true,
      value: {
        kind: "commercial_type",
        slug: "perfumes-de-nicho",
        name: "Perfumes de nicho",
        description: "Selección editorial",
        parentId: valid.parentId,
        publicationStatus: "draft",
        sortOrder: 10,
      },
    });
  });

  it("allows a root category and a blank optional description", () => {
    const result = validateCategoryForm({ ...valid, parentId: "", description: "", sortOrder: "" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ parentId: null, description: null, sortOrder: 0 });
  });

  it.each([
    ["kind", "import_category"],
    ["slug", "Con Espacios"],
    ["name", ""],
    ["parentId", "not-a-uuid"],
    ["publicationStatus", "archived"],
    ["sortOrder", "1.5"],
    ["sortOrder", String(2_147_483_648)],
  ])("rejects invalid %s", (field, value) => {
    const result = validateCategoryForm({ ...valid, [field]: value });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[field]).toBeTruthy();
  });

  it("enforces text limits without silently truncating business data", () => {
    const result = validateCategoryForm({ ...valid, name: "x".repeat(201), description: "x".repeat(4001) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toBeTruthy();
      expect(result.errors.description).toBeTruthy();
    }
  });

  it("accepts only a complete timestamp for optimistic concurrency", () => {
    expect(isValidExpectedTimestamp("2026-09-08T02:20:00.123Z")).toBe(true);
    expect(isValidExpectedTimestamp("2026-09-08T02:20:00+00:00")).toBe(true);
    expect(isValidExpectedTimestamp("2026-09-08")).toBe(false);
    expect(isValidExpectedTimestamp("not-a-date")).toBe(false);
  });
});
