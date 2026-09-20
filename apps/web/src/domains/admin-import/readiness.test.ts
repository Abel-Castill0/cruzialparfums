import { describe, it, expect } from "vitest";
import { classifyProductReadiness, parseImportCatalogFilters } from "./catalog-schema";

const baseInput = {
  productStatus: "published" as const,
  archived: false,
  activePresentations: 1,
  publishedPresentations: 1,
  offerCount: 1,
  unconfirmedOfferCount: 0,
  campaignStatus: "open" as const | null,
};

describe("classifyProductReadiness", () => {
  it("draft product is blocked", () => {
    const r = classifyProductReadiness({ ...baseInput, productStatus: "draft" });
    expect(r.structural).toBe("structured");
    expect(r.blockers).toContain("Producto en borrador");
    expect(r.publicVisibility).toBe("not_public");
  });

  it("published with no active presentations is blocked", () => {
    const r = classifyProductReadiness({ ...baseInput, activePresentations: 0 });
    expect(r.structural).toBe("blocked");
    expect(r.blockers).toContain("Sin presentación activa");
  });

  it("published with active but no published presentations is structured not published", () => {
    const r = classifyProductReadiness({ ...baseInput, publishedPresentations: 0 });
    expect(r.structural).toBe("structured");
    expect(r.blockers).toContain("Sin presentación publicada");
  });

  it("no offers is blocked commercially", () => {
    const r = classifyProductReadiness({ ...baseInput, offerCount: 0 });
    expect(r.commercial).toBe("blocked");
    expect(r.blockers).toContain("Sin oferta en #6");
  });

  it("unconfirmed offers makes commercial pending", () => {
    const r = classifyProductReadiness({ ...baseInput, unconfirmedOfferCount: 2 });
    expect(r.commercial).toBe("pending");
    expect(r.blockers).toContain("Disponibilidad por confirmar");
  });

  it("archived product is blocked", () => {
    const r = classifyProductReadiness({ ...baseInput, archived: true });
    expect(r.structural).toBe("blocked");
    expect(r.blockers).toContain("Producto archivado");
  });

  it("closed campaign blocks public visibility", () => {
    const r = classifyProductReadiness({ ...baseInput, campaignStatus: "closed" });
    expect(r.blockers).toContain("Consolidado no abierto");
    expect(r.publicVisibility).toBe("not_public");
  });

  it("fully ready product is eligible", () => {
    const r = classifyProductReadiness(baseInput);
    expect(r.structural).toBe("published");
    expect(r.commercial).toBe("configured");
    expect(r.publicVisibility).toBe("eligible");
    expect(r.blockers).toEqual([]);
  });
});

describe("parseImportCatalogFilters — media state", () => {
  it("parses with_primary", () => {
    const r = parseImportCatalogFilters({ media: "with_primary" });
    expect(r.mediaState).toBe("with_primary");
  });

  it("parses without_media", () => {
    const r = parseImportCatalogFilters({ media: "without_media" });
    expect(r.mediaState).toBe("without_media");
  });

  it("parses without_primary", () => {
    const r = parseImportCatalogFilters({ media: "without_primary" });
    expect(r.mediaState).toBe("without_primary");
  });

  it("ignores invalid media value", () => {
    const r = parseImportCatalogFilters({ media: "bogus" });
    expect(r.mediaState).toBeUndefined();
  });
});

describe("parseImportCatalogFilters — publication status", () => {
  it("parses valid statuses", () => {
    for (const s of ["draft", "published", "hidden", "archived"]) {
      const r = parseImportCatalogFilters({ status: s });
      expect(r.publicationStatus).toBe(s);
    }
  });

  it("ignores invalid status", () => {
    const r = parseImportCatalogFilters({ status: "nope" });
    expect(r.publicationStatus).toBeUndefined();
  });
});

describe("parseImportCatalogFilters — presentation state", () => {
  it("parses with_active", () => {
    const r = parseImportCatalogFilters({ presentation: "with_active" });
    expect(r.presentationState).toBe("with_active");
  });

  it("parses without_active", () => {
    const r = parseImportCatalogFilters({ presentation: "without_active" });
    expect(r.presentationState).toBe("without_active");
  });

  it("parses without_published", () => {
    const r = parseImportCatalogFilters({ presentation: "without_published" });
    expect(r.presentationState).toBe("without_published");
  });

  it("ignores invalid presentation value", () => {
    const r = parseImportCatalogFilters({ presentation: "something" });
    expect(r.presentationState).toBeUndefined();
  });
});

describe("parseImportCatalogFilters — offer state", () => {
  it("parses with_offer", () => {
    const r = parseImportCatalogFilters({ offer: "with_offer" });
    expect(r.offerState).toBe("with_offer");
  });

  it("parses without_offer", () => {
    const r = parseImportCatalogFilters({ offer: "without_offer" });
    expect(r.offerState).toBe("without_offer");
  });

  it("ignores invalid offer value", () => {
    const r = parseImportCatalogFilters({ offer: "bogus" });
    expect(r.offerState).toBeUndefined();
  });
});

describe("parseImportCatalogFilters — page and page_size", () => {
  it("defaults page to 1 and pageSize to 40", () => {
    const r = parseImportCatalogFilters({});
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(40);
  });

  it("clamps pageSize below 1 to 1", () => {
    const r = parseImportCatalogFilters({ pageSize: "0" });
    expect(r.pageSize).toBe(1);
  });

  it("clamps pageSize above 50 to 50", () => {
    const r = parseImportCatalogFilters({ pageSize: "999" });
    expect(r.pageSize).toBe(50);
  });

  it("resets negative page to 1", () => {
    const r = parseImportCatalogFilters({ page: "-5" });
    expect(r.page).toBe(1);
  });

  it("resets non-numeric page to 1", () => {
    const r = parseImportCatalogFilters({ page: "abc" });
    expect(r.page).toBe(1);
  });
});

describe("parseImportCatalogFilters — query sanitization", () => {
  it("trims whitespace", () => {
    const r = parseImportCatalogFilters({ q: "  hello  " });
    expect(r.query).toBe("hello");
  });

  it("truncates query to 120 characters", () => {
    const long = "x".repeat(200);
    const r = parseImportCatalogFilters({ q: long });
    expect(r.query).toHaveLength(120);
  });

  it("returns empty string for undefined q", () => {
    const r = parseImportCatalogFilters({});
    expect(r.query).toBe("");
  });
});
