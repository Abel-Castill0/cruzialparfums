import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "../catalog/legacy-catalog-repository";
import { buildCustomComboMessage } from "../whatsapp/parfums-message-builder";
import {
  addComboLine,
  calculateComboLinesTotal,
  canSendCombo,
  filterComboProducts,
  listComboEligibleProducts,
  removeComboLine,
  resolveComboLines,
  setComboLineSize,
  type ComboLine,
} from "./combo-builder";

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
