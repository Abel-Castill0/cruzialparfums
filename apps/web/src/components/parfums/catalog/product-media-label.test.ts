import { describe, expect, it } from "vitest";
import { productMediaLinkLabel } from "./product-media-label";

describe("productMediaLinkLabel", () => {
  it("names a product with a photo by brand and name", () => {
    expect(productMediaLinkLabel({ brand: "Maison Alhambra", name: "Lovely Cherry", imageUrl: "https://x/y.jpg" })).toBe(
      "Ver Maison Alhambra Lovely Cherry",
    );
  });
  it("includes the visible placeholder text when there is no photo (WCAG 2.5.3)", () => {
    for (const imageUrl of [null, undefined, ""]) {
      expect(productMediaLinkLabel({ brand: "Maison Alhambra", name: "Lovely Cherry", imageUrl })).toContain("Foto próximamente");
    }
  });
});
