import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "@/domains/catalog/legacy-catalog-repository";
import type { CatalogProduct } from "@/domains/catalog/types";
import { galleryImages } from "./product-gallery";

const base = new LegacyCatalogRepository().list()[0]!;

function withMedia(media: CatalogProduct["media"]): CatalogProduct {
  return { ...base, brand: "Lattafa", name: "Khamrah", imageAlt: "Lattafa Khamrah", media };
}

describe("galleryImages", () => {
  it("keeps the admin's order and gives photos without alt text a readable one", () => {
    const images = galleryImages(
      withMedia([
        { url: "https://res.cloudinary.com/x/a.png", alt: "Frasco", isPrimary: true, sortOrder: 0 },
        { url: "https://res.cloudinary.com/x/b.png", alt: "  ", isPrimary: false, sortOrder: 1 },
      ]),
      null,
    );
    expect(images.map((image) => image.url)).toEqual([
      "https://res.cloudinary.com/x/a.png",
      "https://res.cloudinary.com/x/b.png",
    ]);
    expect(images[1]!.alt).toBe("Lattafa Khamrah");
  });

  it("never repeats a photo that is also the presentation photo", () => {
    const url = "https://res.cloudinary.com/x/a.png";
    const images = galleryImages(withMedia([{ url, alt: "A", isPrimary: true, sortOrder: 0 }]), url);
    expect(images).toHaveLength(1);
  });

  it("falls back to the presentation photo for a product with no media rows", () => {
    expect(galleryImages(withMedia([]), "/img/legacy.webp")).toEqual([{ url: "/img/legacy.webp", alt: "Lattafa Khamrah" }]);
  });

  it("is empty when the product has no photo at all", () => {
    expect(galleryImages(withMedia([]), null)).toEqual([]);
  });
});
