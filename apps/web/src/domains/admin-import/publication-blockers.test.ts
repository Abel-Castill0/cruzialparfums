import { describe, expect, it } from "vitest";
import { BLOCKER_FILTER_OPTIONS, blockerLabel, buildBlockerSummary, publicationListHref } from "./publication-blockers";

describe("buildBlockerSummary", () => {
  it("current production shape: availability is the first and main blocker", () => {
    const summary = buildBlockerSummary(
      { offer_unconfirmed: 898, offer_invalid_price: 0, missing_primary_media: 12, product_unpublished: 0 },
      "c6",
      true,
    );
    expect(summary.groups.map((group) => group.code)).toEqual(["offer_unconfirmed", "missing_primary_media"]);
    const first = summary.groups[0]!;
    expect(first.label).toBe("Disponibilidad sin confirmar");
    expect(first.countText).toBe("898 ofertas");
    expect(first.why).toMatch(/no pueden aparecer en el catálogo/);
    expect(first.href).toBe("/admin/import/consolidados/c6?disponibilidad=unconfirmed#productos");
    expect(summary.total).toBe(910);
  });

  it("never treats an unreadable count as zero", () => {
    const summary = buildBlockerSummary({ offer_unconfirmed: null, missing_offer: 0 }, "c1", true);
    expect(summary.groups).toEqual([]);
    expect(summary.unverified).toEqual(["offer_unconfirmed"]);
  });

  it("uses singular nouns and a read-only action label for viewers", () => {
    const summary = buildBlockerSummary({ missing_offer: 1 }, "c1", false);
    expect(summary.groups[0]!.countText).toBe("1 producto");
    expect(summary.groups[0]!.actionLabel).toBe("Ver detalle");
    expect(summary.groups[0]!.href).toBe("/admin/import/publicacion?campaign=c1&blocker=missing_offer#detalle");
  });
});

describe("blocker labels", () => {
  it("humanizes known codes and hides unknown raw codes", () => {
    expect(blockerLabel("missing_primary_media")).toBe("Falta imagen principal");
    expect(blockerLabel("offer_invalid_price")).toBe("Precio por corregir");
    expect(blockerLabel("category_not_public")).toBe("Otro bloqueo");
  });

  it("offers only codes the RPC accepts as filters", () => {
    const accepted = new Set([
      "product_unpublished", "presentation_unpublished", "presentation_archived", "missing_primary_media",
      "missing_offer", "offer_unconfirmed", "offer_invalid_price", "offer_invalid_availability",
      "category_not_public", "no_active_presentations",
    ]);
    for (const option of BLOCKER_FILTER_OPTIONS) expect(accepted.has(option.value)).toBe(true);
  });

  it("encodes list links", () => {
    expect(publicationListHref("c1")).toBe("/admin/import/publicacion?campaign=c1#detalle");
  });
});
