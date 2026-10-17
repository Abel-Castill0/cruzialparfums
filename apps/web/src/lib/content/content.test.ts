import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag, unstable_cache: (fn: unknown) => fn }));

import { CONTENT_BLOCKS_CACHE_TAG, CONTENT_BLOCKS_REVALIDATE_SECONDS, contentPageCacheTag } from "./content-cache";
import { CAROUSEL_SPEED_DEFAULT, CAROUSEL_SPEED_MAX, CAROUSEL_SPEED_MIN } from "./carousel-speed";
import { CONTENT_PAGES, CONTENT_SECTIONS, findSection, sectionsForPage } from "./registry";
import {
  CONTENT_MAX,
  contentSchemaFor,
  isSafeContentHref,
  parseBlockContent,
  validateBlockContent,
  type ContentBlockType,
} from "./schemas";
import { revalidateContentBlocks } from "./revalidate";

describe("content block schemas", () => {
  it("accepts the copy each section ships as its fallback (a fallback can never be rejected by its own schema)", () => {
    for (const section of CONTENT_SECTIONS) {
      const parsed = parseBlockContent(section.blockType, section.fallback);
      expect(parsed, `${section.page}/${section.key}`).not.toBeNull();
    }
  });

  it("refuses javascript:, data:, http: and protocol-relative destinations", () => {
    for (const href of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "http://example.com",
      "//evil.example.com",
      "vbscript:msgbox",
      "",
    ]) {
      expect(isSafeContentHref(href), href).toBe(false);
    }
    expect(isSafeContentHref("/parfums/catalogo")).toBe(true);
    expect(isSafeContentHref("https://www.tiktok.com/@cruzial")).toBe(true);
    expect(isSafeContentHref("  https://example.com/path  ")).toBe(true);
  });

  it("refuses HTML and control characters in the editable copy", () => {
    const html = validateBlockContent("text_banner", {
      title: "<script>alert(1)</script>",
      body: "Texto",
    });
    expect(html.ok).toBe(false);

    const bodyHtml = validateBlockContent("text_banner", {
      title: "Título",
      body: '<img src=x onerror="alert(1)">',
    });
    expect(bodyHtml.ok).toBe(false);

    const control = validateBlockContent("hero", { title: "Título\u0000\u0007" });
    expect(control.ok).toBe(false);
  });

  it("enforces the length limits of every field", () => {
    const long = "x".repeat(CONTENT_MAX.title + 1);
    const overTitle = validateBlockContent("hero", { title: long });
    expect(overTitle.ok).toBe(false);

    const overCta = validateBlockContent("hero", {
      title: "Título",
      ctaLabel: "x".repeat(CONTENT_MAX.ctaLabel + 1),
      ctaHref: "/parfums/catalogo",
    });
    expect(overCta.ok).toBe(false);

    const overBody = validateBlockContent("text_banner", {
      title: "Título",
      body: "x".repeat(CONTENT_MAX.body + 1),
    });
    expect(overBody.ok).toBe(false);

    const exactlyMax = validateBlockContent("hero", { title: "x".repeat(CONTENT_MAX.title) });
    expect(exactlyMax.ok).toBe(true);
  });

  it("keeps the call to action paired and refuses an unpaired one", () => {
    const labelOnly = validateBlockContent("hero", { title: "Título", ctaLabel: "Explorar" });
    expect(labelOnly.ok).toBe(false);
    if (!labelOnly.ok) expect(labelOnly.errors.ctaHref).toBeTruthy();

    const hrefOnly = validateBlockContent("hero", { title: "Título", ctaHref: "/parfums/catalogo" });
    expect(hrefOnly.ok).toBe(false);
    if (!hrefOnly.ok) expect(hrefOnly.errors.ctaLabel).toBeTruthy();
  });

  it("refuses an unsafe destination even when it arrives paired", () => {
    const unsafe = validateBlockContent("hero", {
      title: "Título",
      ctaLabel: "Explorar",
      ctaHref: "javascript:alert(1)",
    });
    expect(unsafe.ok).toBe(false);
    if (!unsafe.ok) expect(unsafe.errors.ctaHref).toBeTruthy();
  });

  it("is strict: unknown keys are rejected, so an unexpected form field can never be stored", () => {
    const subtitle = validateBlockContent("carousel", { title: "Destacados", subtitle: "Bajada" });
    expect(subtitle.ok).toBe(false);

    const injected = validateBlockContent("text_banner", {
      title: "Título",
      body: "Texto",
      business_unit_id: "00000000-0000-0000-0000-000000000000",
      is_visible: false,
    });
    expect(injected.ok).toBe(false);
  });

  it("covers the closed set of block types with one schema each", () => {
    const types: ContentBlockType[] = ["hero", "text_banner", "carousel"];
    for (const type of types) expect(contentSchemaFor(type)).toBeTruthy();
    expect(Object.keys(contentSchemaFor("carousel").shape)).toEqual(["title", "speed"]);
  });

  it("accepts an optional carousel speed only inside 20-60 whole px/s", () => {
    expect(validateBlockContent("carousel", { title: "Destacados" }).ok).toBe(true);
    expect(validateBlockContent("carousel", { speed: CAROUSEL_SPEED_MIN }).ok).toBe(true);
    expect(validateBlockContent("carousel", { speed: CAROUSEL_SPEED_MAX }).ok).toBe(true);
    expect(validateBlockContent("carousel", { speed: CAROUSEL_SPEED_DEFAULT }).ok).toBe(true);

    for (const speed of [CAROUSEL_SPEED_MIN - 1, CAROUSEL_SPEED_MAX + 1, 26.5, Number.NaN]) {
      expect(validateBlockContent("carousel", { speed }), String(speed)).toEqual({
        ok: false,
        errors: { speed: expect.any(String) },
      });
    }
  });

  it("treats a corrupt stored row as absent on the public read (the page uses its fallback)", () => {
    expect(parseBlockContent("hero", { title: "Ok", ctaHref: "javascript:alert(1)", ctaLabel: "x" })).toBeNull();
    expect(parseBlockContent("hero", { title: "<b>Ok</b>" })).toBeNull();
    expect(parseBlockContent("text_banner", null)).toBeNull();
    expect(parseBlockContent("carousel", "no")).toBeNull();
    expect(parseBlockContent("hero", { title: "Perfumería de descubrimiento." })).toEqual({
      title: "Perfumería de descubrimiento.",
    });
  });

  it("reports one message per field for the admin form", () => {
    const result = validateBlockContent("text_banner", { title: "", body: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.title).toBeTruthy();
      expect(result.errors.body).toBeTruthy();
    }
  });
});

describe("content registry", () => {
  it("declares a section per editable text, with a unique key per page", () => {
    const keys = CONTENT_SECTIONS.map((section) => `${section.page}:${section.key}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(CONTENT_SECTIONS.length).toBeGreaterThanOrEqual(6);
  });

  it("keeps the page set closed and the lookup helpers consistent", () => {
    expect(CONTENT_PAGES).toEqual(["home", "parfums", "import"]);
    for (const page of CONTENT_PAGES) {
      expect(sectionsForPage(page).every((section) => section.page === page)).toBe(true);
      expect(sectionsForPage(page).length).toBeGreaterThan(0);
    }
    expect(findSection("parfums", "hero")?.blockType).toBe("hero");
    expect(findSection("home", "hero")).toBeNull();
    expect(findSection("parfums", "inexistente")).toBeNull();
  });

  it("gives every section a label, a description and a human unit", () => {
    for (const section of CONTENT_SECTIONS) {
      expect(section.label.length).toBeGreaterThan(0);
      expect(section.description.length).toBeGreaterThan(0);
      expect(["parfums", "import"]).toContain(section.unit);
    }
  });

  it("leaves the two selector doors without a call to action (their destination is structural)", () => {
    for (const key of ["door_parfums", "door_import"]) {
      const section = findSection("home", key);
      expect(section?.blockType).toBe("text_banner");
      expect(section?.fallback).not.toHaveProperty("ctaHref");
      expect(section?.fallback).not.toHaveProperty("ctaLabel");
    }
  });

  it("keeps the fallback copy of the gateway doors and the Import gallery verbatim (zero-regression copy)", () => {
    expect(findSection("home", "door_parfums")?.fallback).toEqual({
      title: "Parfums",
      body: "Decants, frascos y combos de perfumería árabe, de diseñador y nicho.",
    });
    expect(findSection("home", "door_import")?.fallback).toEqual({
      title: "Import",
      body: "Consolidados de perfumería: compra grupal por campaña.",
    });
    expect(findSection("import", "process")?.fallback).toEqual({
      title: "Pedidos que llegan a tu puerta",
      body: "Cada fragancia se revisa y prepara con cuidado antes de llegar a ti.",
    });
    expect(findSection("parfums", "craft")?.fallback).toEqual({
      title: "Del frasco original a tu piel.",
      body: "Perfumes sellados y una preparación cuidadosa en cada pedido.",
      ctaLabel: "Conoce Cruzial",
      ctaHref: "/parfums/nosotros",
    });
  });
});

describe("content cache policy", () => {
  beforeEach(() => revalidateTag.mockClear());

  it("uses one editorial tag, a page tag and the shared 5 minute TTL", () => {
    expect(CONTENT_BLOCKS_CACHE_TAG).toBe("content-blocks");
    expect(CONTENT_BLOCKS_REVALIDATE_SECONDS).toBe(300);
    expect(contentPageCacheTag("parfums")).toBe("page-parfums");
  });

  it("expires the editorial tag and the page tag immediately after a mutation", () => {
    revalidateContentBlocks("parfums");
    expect(revalidateTag).toHaveBeenCalledTimes(2);
    expect(revalidateTag).toHaveBeenCalledWith("content-blocks", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith("page-parfums", { expire: 0 });
  });
});
