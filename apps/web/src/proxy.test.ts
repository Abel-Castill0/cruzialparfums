import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

// proxy() is async since it also refreshes the Supabase session on admin
// routes, so every case awaits the response.
describe("legacy route proxy", () => {
  it("connects a static legacy URL to the Parfums runtime with a temporary redirect", async () => {
    const response = await proxy(new NextRequest("https://preview.example/catalog.html?type=arab"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://preview.example/parfums/catalogo?type=arab",
    );
  });

  it("resolves a known legacy product and preserves non-id query parameters", async () => {
    const response = await proxy(new NextRequest(
      "https://preview.example/product.html?id=khamrah-clasico&variant=bottle",
    ));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://preview.example/parfums/productos/khamrah-clasico?variant=bottle",
    );
  });

  it("does not invent a redirect for an unknown legacy product", async () => {
    const response = await proxy(new NextRequest(
      "https://preview.example/product.html?id=missing",
    ));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("passes an admin route through without redirecting when Supabase is unconfigured", async () => {
    // The storefront must keep working with no backend configured, so the
    // session refresh is a no-op rather than an error in that state.
    const response = await proxy(new NextRequest("https://preview.example/admin"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
