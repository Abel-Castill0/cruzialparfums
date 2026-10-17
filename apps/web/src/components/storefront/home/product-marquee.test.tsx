import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MARQUEE_DRIFT_PX_PER_SECOND, ProductMarquee, type MarqueeItem } from "./product-marquee";

const items: MarqueeItem[] = [{ id: "a", href: "/parfums/productos/a", image: null, alt: "A", title: "Perfume A" }];

describe("product marquee", () => {
  it("drifts at 40 px/s by default (the fallback when the admin never set a speed)", () => {
    expect(MARQUEE_DRIFT_PX_PER_SECOND).toBe(40);
  });

  it("applies the admin-set speed to the rail as a data attribute and a --mq-speed CSS variable", () => {
    const html = renderToStaticMarkup(
      <ProductMarquee tone="parfums" label="Fragancias" items={items} heading={<h2>Destacados</h2>} speed={52} />,
    );
    expect(html).toContain('data-marquee-speed="52"');
    expect(html).toContain("--mq-speed:52");
  });

  it("falls back to the shared default speed when none is given (e.g. the Import rail)", () => {
    const html = renderToStaticMarkup(
      <ProductMarquee tone="import" label="Consolidado" items={items} heading={<h2>Productos</h2>} />,
    );
    expect(html).toContain(`data-marquee-speed="${MARQUEE_DRIFT_PX_PER_SECOND}"`);
    expect(html).toContain(`--mq-speed:${MARQUEE_DRIFT_PX_PER_SECOND}`);
  });
});
