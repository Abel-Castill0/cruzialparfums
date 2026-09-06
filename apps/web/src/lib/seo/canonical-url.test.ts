import { describe, expect, it } from "vitest";
import { resolveCanonicalUrl } from "./canonical-url";

describe("canonical URL infrastructure", () => {
  it("prepares an absolute URL only from an explicit valid site URL", () => {
    expect(
      resolveCanonicalUrl(
        "/parfums/productos/khamrah-clasico",
        "https://cruzial.example/",
      ),
    ).toBe("https://cruzial.example/parfums/productos/khamrah-clasico");
    expect(resolveCanonicalUrl("/parfums", undefined)).toBeUndefined();
    expect(resolveCanonicalUrl("/parfums", "not-a-url")).toBeUndefined();
  });
});
