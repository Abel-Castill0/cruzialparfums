import { describe, expect, it } from "vitest";
import {
  buildImportChecklist,
  campaignStatusPresentation,
  selectImportNextAction,
  type ImportReadinessInput,
} from "./campaign-presentation";

const NOW = new Date("2026-09-28T12:00:00Z");

function input(overrides: Partial<ImportReadinessInput> = {}): ImportReadinessInput {
  return {
    campaignId: "c1",
    status: "draft",
    archived: false,
    opensAt: null,
    closesAt: null,
    now: NOW,
    offerCount: 898,
    missingOfferCount: 0,
    invalidPriceCount: 0,
    unconfirmedOfferCount: 898,
    missingMediaCount: 0,
    unpublishedProductCount: 0,
    unpublishedPresentationCount: 0,
    readyForManualOpen: false,
    isPublicNow: false,
    canEdit: true,
    ...overrides,
  };
}

function state(steps: ReturnType<typeof buildImportChecklist>, id: string) {
  return steps.find((step) => step.id === id)!;
}

describe("campaignStatusPresentation", () => {
  it("never exposes raw enum names and states the public consequence", () => {
    for (const status of ["draft", "scheduled", "open", "paused", "closed", "fulfilled"]) {
      const p = campaignStatusPresentation(status);
      expect(p.label).not.toBe(status);
      expect(p.publicConsequence.length).toBeGreaterThan(10);
    }
    expect(campaignStatusPresentation("draft").publicConsequence).toBe("El catálogo todavía no es visible para tus clientes.");
    expect(campaignStatusPresentation("closed").publicConsequence).toBe("Ya no se aceptan nuevas solicitudes.");
  });

  it("does not claim scheduled campaigns open automatically", () => {
    expect(campaignStatusPresentation("scheduled").description).toContain("no abre el consolidado automáticamente");
  });

  it("flags an unknown status instead of echoing it", () => {
    const p = campaignStatusPresentation("weird");
    expect(p.label).toBe("Estado desconocido");
    expect(p.tone).toBe("attention");
  });
});

describe("buildImportChecklist", () => {
  it("current production shape: draft, all offers unconfirmed → availability needs attention, open blocked", () => {
    const steps = buildImportChecklist(input());
    expect(state(steps, "offers").state).toBe("complete");
    expect(state(steps, "availability").state).toBe("attention");
    expect(state(steps, "availability").detail).toBe("898 ofertas necesitan confirmación de disponibilidad.");
    expect(state(steps, "availability").href).toBe("/admin/import/publicacion?blocker=offer_unconfirmed&campaign=c1");
    expect(state(steps, "schedule").state).toBe("not_started");
    expect(state(steps, "open").state).toBe("blocked");
  });

  it("with no offers, availability cannot start yet", () => {
    const steps = buildImportChecklist(input({ offerCount: 0, unconfirmedOfferCount: 0 }));
    expect(state(steps, "offers").state).toBe("not_started");
    expect(state(steps, "availability").state).toBe("blocked");
  });

  it("never marks a step complete when its facts are unknown", () => {
    const steps = buildImportChecklist(input({
      offerCount: null,
      unconfirmedOfferCount: null,
      missingMediaCount: null,
      readyForManualOpen: null,
    }));
    expect(state(steps, "offers").state).toBe("unknown");
    expect(state(steps, "availability").state).toBe("unknown");
    expect(state(steps, "publication").state).toBe("unknown");
    expect(state(steps, "open").state).toBe("unknown");
  });

  it("a past closing date needs attention", () => {
    const steps = buildImportChecklist(input({ closesAt: "2026-09-01T00:00:00Z" }));
    expect(state(steps, "schedule").state).toBe("attention");
  });

  it("ready campaign offers opening; viewer gets a read-only label", () => {
    const ready = input({ unconfirmedOfferCount: 0, readyForManualOpen: true });
    expect(state(buildImportChecklist(ready), "open").actionLabel).toBe("Abrir consolidado");
    expect(state(buildImportChecklist({ ...ready, canEdit: false }), "open").actionLabel).toBe("Ver consolidado");
    expect(state(buildImportChecklist({ ...input(), canEdit: false }), "availability").actionLabel).toBe("Ver detalle");
  });

  it("publication link filters only when it shows exactly the counted blocker", () => {
    const single = state(buildImportChecklist(input({ missingMediaCount: 4 })), "publication");
    expect(single.detail).toBe("4 productos sin imagen principal.");
    expect(single.href).toBe("/admin/import/publicacion?blocker=missing_primary_media&campaign=c1");

    const mixed = state(buildImportChecklist(input({ missingMediaCount: 4, unpublishedProductCount: 2 })), "publication");
    expect(mixed.href).toBe("/admin/import/publicacion?campaign=c1");
  });

  it("price and missing-offer links use the blocker that produced the count", () => {
    expect(state(buildImportChecklist(input({ invalidPriceCount: 2 })), "offers").href)
      .toBe("/admin/import/publicacion?blocker=offer_invalid_price&campaign=c1");
    expect(state(buildImportChecklist(input({ missingOfferCount: 5 })), "offers").href)
      .toBe("/admin/import/publicacion?blocker=missing_offer&campaign=c1");
  });

  it("open campaign reflects the public selector, not the status alone", () => {
    expect(state(buildImportChecklist(input({ status: "open", isPublicNow: true })), "open").state).toBe("complete");
    expect(state(buildImportChecklist(input({ status: "open", isPublicNow: false })), "open").state).toBe("attention");
  });
});

describe("selectImportNextAction", () => {
  it("prioritizes confirming availability for the current production shape", () => {
    const next = selectImportNextAction(buildImportChecklist(input()));
    expect(next?.title).toBe("Confirmar disponibilidad");
    expect(next?.detail).toContain("898");
  });

  it("keeps a meaningful title for read-only members while the button stays read-only", () => {
    const next = selectImportNextAction(buildImportChecklist(input({ canEdit: false })));
    expect(next?.title).toBe("Confirmar disponibilidad");
    expect(next?.actionLabel).toBe("Ver detalle");
  });

  it("price problems come before availability", () => {
    const next = selectImportNextAction(buildImportChecklist(input({ invalidPriceCount: 3 })));
    expect(next?.title).toBe("Corregir precios");
  });

  it("missing dates alone are not a next action", () => {
    const next = selectImportNextAction(buildImportChecklist(input({ unconfirmedOfferCount: 0, readyForManualOpen: true })));
    expect(next?.title).toBe("Abrir consolidado");
  });

  it("returns null rather than guessing when facts are unknown", () => {
    expect(selectImportNextAction(buildImportChecklist(input({ offerCount: null })))).toBeNull();
  });

  it("returns null when everything is done and public", () => {
    const next = selectImportNextAction(buildImportChecklist(input({
      status: "open",
      unconfirmedOfferCount: 0,
      readyForManualOpen: true,
      isPublicNow: true,
      opensAt: "2026-09-01T00:00:00Z",
      closesAt: "2026-10-30T00:00:00Z",
    })));
    expect(next).toBeNull();
  });
});
