import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProcessGallery } from "./process-gallery";

describe("ProcessGallery", () => {
  it("renders one accessible photo control per image and lazy-loads after the first", () => {
    const images = [
      { src: "/one.webp", alt: "Primer perfume sellado" },
      { src: "/two.webp", alt: "Segundo perfume sellado" },
      { src: "/three.webp", alt: "Tercer perfume sellado" },
    ];
    const html = renderToStaticMarkup(createElement(ProcessGallery, { images }));

    expect(html.match(/aria-label="Ampliar foto:/g)).toHaveLength(images.length);
    expect(html.match(/alt="[^"]+"/g)).toHaveLength(images.length);
    expect(html).toContain('loading="eager"');
    expect(html.match(/loading="lazy"/g)).toHaveLength(images.length - 1);
  });
});
