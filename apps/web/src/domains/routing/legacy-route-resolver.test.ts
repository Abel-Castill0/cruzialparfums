import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "../catalog/legacy-catalog-repository";
import { resolveLegacyRoute } from "./legacy-route-resolver";

describe("legacy route compatibility contract", () => {
  const products = new LegacyCatalogRepository();

  it.each([
    ["/index.html", "/parfums"],
    ["/catalog.html", "/parfums/catalogo"],
    ["/combos.html#combo-vainilla", "/parfums/combos#combo-vainilla"],
    ["/checkout.html", "/parfums/checkout"],
    ["/mayorista.html", "/parfums/mayorista"],
    ["/nosotros.html", "/parfums/nosotros"],
    ["/contacto.html", "/parfums/contacto"],
    ["/privacidad.html", "/parfums/privacidad"],
    ["/terminos.html", "/parfums/terminos"],
  ])("maps %s without a permanent redirect", (legacy, expected) => {
    expect(resolveLegacyRoute(legacy, products)).toEqual({
      destination: expected,
      permanent: false,
      statusCode: 307,
    });
  });

  it("resolves known product ids and preserves non-id query parameters", () => {
    expect(
      resolveLegacyRoute(
        "/product.html?id=khamrah-clasico&variant=bottle&source=legacy#buy",
        products,
      ),
    ).toEqual({
      destination:
        "/parfums/productos/khamrah-clasico?variant=bottle&source=legacy#buy",
      permanent: false,
      statusCode: 307,
    });
  });

  it("does not invent a destination for an unknown product", () => {
    expect(resolveLegacyRoute("/product.html?id=missing", products)).toBeNull();
  });
});
