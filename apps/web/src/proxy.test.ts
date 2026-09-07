import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("legacy route proxy", () => {
  it("connects a static legacy URL to the Parfums runtime with a temporary redirect", () => {
    const response = proxy(new NextRequest("https://preview.example/catalog.html?type=arab"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://preview.example/parfums/catalogo?type=arab",
    );
  });

  it("resolves a known legacy product and preserves non-id query parameters", () => {
    const response = proxy(new NextRequest(
      "https://preview.example/product.html?id=khamrah-clasico&variant=bottle",
    ));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://preview.example/parfums/productos/khamrah-clasico?variant=bottle",
    );
  });

  it("does not invent a redirect for an unknown legacy product", () => {
    const response = proxy(new NextRequest(
      "https://preview.example/product.html?id=missing",
    ));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
