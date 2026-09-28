import { describe, expect, it } from "vitest";
import type { ImportProductDetail } from "./catalog-repository";
import {
  IMPORT_LIST_VIEWS,
  assessImportProduct,
  campaignSwitchHiddenParams,
  currentImportView,
  importViewHref,
} from "./product-presentation";

const now = "2026-09-28T12:00:00.000Z";

function detail(options: { status?: string; presentations?: { published?: boolean; archived?: boolean; offer?: string | null }[] } = {}): ImportProductDetail {
  const presentations = (options.presentations ?? [{ published: true, offer: "available" }]).map((p, i) => ({
    id: `ip${i}`, product_id: "p1", label: "100 ml", presentation_class: "single_fixed", capacity_ml: 100,
    publication_status: p.published === false ? "draft" : "published", archived_at: p.archived ? now : null,
    updated_at: now, created_at: now,
    offer: p.offer === null || p.offer === undefined ? null : { price_amount: 100, currency: "PEN", availability_status: p.offer },
  }));
  return {
    product: { id: "p1", name: "Perfume", brand: null, slug: "p1", legacy_id: null, publication_status: options.status ?? "published", archived_at: null, verification_status: "legacy", updated_at: now } as unknown as ImportProductDetail["product"],
    categories: [],
    category: null,
    presentations: presentations as unknown as ImportProductDetail["presentations"],
    offerCount: presentations.filter((p) => p.offer).length,
    activeCampaignNumber: 6,
    activeCampaignId: "c6",
    activeCampaignUpdatedAt: now,
  };
}

const openCampaign = { id: "c6", number: 6, status: "open" };
const draftCampaign = { id: "c6", number: 6, status: "draft" };

describe("assessImportProduct", () => {
  it("is visible in an open consolidado when every condition holds", () => {
    const result = assessImportProduct(detail(), openCampaign);
    expect(result.inCatalog).toBe(true);
    expect(result.nextStep).toBeNull();
  });

  it("points unconfirmed availability to the consolidado offer section", () => {
    const result = assessImportProduct(detail({ presentations: [{ published: true, offer: "unconfirmed" }] }), openCampaign);
    expect(result.inCatalog).toBe(false);
    expect(result.readiness.blockers).toContain("Disponibilidad sin confirmar");
    expect(result.nextStep?.title).toBe("Confirmar disponibilidad");
    expect(result.nextStep?.href).toBe("#consolidado");
  });

  it("sends a missing offer to the consolidado, never inventing a price", () => {
    const result = assessImportProduct(detail({ presentations: [{ published: true, offer: null }] }), openCampaign);
    expect(result.nextStep?.href).toBe("/admin/import/consolidados/c6#productos");
  });

  it("puts product publication first", () => {
    expect(assessImportProduct(detail({ status: "draft" }), openCampaign).nextStep?.href).toBe("#datos");
  });

  it("explains a ready product in a closed/draft consolidado", () => {
    const result = assessImportProduct(detail(), draftCampaign);
    expect(result.inCatalog).toBe(false);
    expect(result.nextStep?.title).toBe("El consolidado no está abierto");
  });

  it("ignores archived presentations when counting", () => {
    const result = assessImportProduct(detail({ presentations: [{ archived: true, offer: "unconfirmed" }, { published: true, offer: "available" }] }), openCampaign);
    expect(result.counts).toEqual({ active: 1, published: 1, offers: 1, unconfirmed: 0 });
  });

  it("never guesses without a consolidado", () => {
    const result = assessImportProduct(detail(), null);
    expect(result.inCatalog).toBe(false);
    expect(result.nextStep).toBeNull();
  });
});

describe("Import list views", () => {
  it("only offers views backed by an exact list predicate", () => {
    for (const view of IMPORT_LIST_VIEWS) {
      for (const [key, value] of Object.entries(view.params)) {
        expect(["status", "offer", "media"]).toContain(key);
        expect(["draft", "without_offer", "without_primary", "without_media"]).toContain(value);
      }
    }
    expect(currentImportView({ campaign: "c6", q: "oud" })).toBe("all");
    expect(currentImportView({ media: "without_primary" })).toBe("without_primary");
  });

  it("keeps the campaign and search when switching views", () => {
    const view = IMPORT_LIST_VIEWS.find((candidate) => candidate.key === "draft")!;
    expect(importViewHref("/admin/import/productos", { campaign: "c6", q: "oud", media: "without_media", page: "2" }, view))
      .toBe("/admin/import/productos?campaign=c6&q=oud&status=draft");
  });

  it("switching consolidado keeps filters but resets campaign and page", () => {
    expect(campaignSwitchHiddenParams({ campaign: "c5", page: "3", q: "oud", offer: "without_offer" })).toEqual([["q", "oud"], ["offer", "without_offer"]]);
  });
});
