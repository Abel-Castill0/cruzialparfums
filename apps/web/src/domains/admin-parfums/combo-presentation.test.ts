import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  COMBO_BLOCKER_OWNER_LABELS,
  COMBO_VERIFICATION_OWNER_LABELS,
  comboNextAction,
  comboPresentationLabel,
  comboVerificationLabel,
  comboVerificationTone,
  comboVisibility,
} from "./combo-presentation";
import { PERSISTED_VERIFICATION_STATUSES, computeComboReadiness, type ComboReadinessBlocker } from "./combo-schema";

const ready = {
  productPublicationStatus: "published",
  productArchived: false,
  comboArchived: false,
  compositionVerificationStatus: "official_pdf",
  itemCount: 3,
  hasArchivedItem: false,
};

describe("combo verification labels", () => {
  it("humanizes every persisted status without inventing new ones", () => {
    expect(Object.keys(COMBO_VERIFICATION_OWNER_LABELS).sort()).toEqual([...PERSISTED_VERIFICATION_STATUSES].sort());
    expect(COMBO_VERIFICATION_OWNER_LABELS.official_pdf).toBe("Composición verificada por fuente oficial");
    expect(COMBO_VERIFICATION_OWNER_LABELS.client_confirmed).toBe("Composición confirmada por cliente");
    expect(COMBO_VERIFICATION_OWNER_LABELS.pending_reconfirmation).toBe("Necesita reconfirmación");
    expect(COMBO_VERIFICATION_OWNER_LABELS.unknown).toBe("Sin verificar");
  });

  it("only confirmed authorities read as healthy", () => {
    expect(comboVerificationTone("official_pdf")).toBe("healthy");
    expect(comboVerificationTone("client_confirmed")).toBe("healthy");
    expect(comboVerificationTone("pending_reconfirmation")).toBe("attention");
    expect(comboVerificationTone("unknown")).toBe("attention");
    expect(comboVerificationTone("something_else")).toBe("attention");
  });

  it("never shows a raw enum for an unexpected value", () => {
    expect(comboVerificationLabel("legacy")).toBe("Estado de verificación desconocido");
  });
});

describe("comboVisibility", () => {
  it("is visible only when computeComboReadiness reports no blockers", () => {
    const visibility = comboVisibility(computeComboReadiness(ready));
    expect(visibility.visible).toBe(true);
    expect(visibility.headline).toBe("Este combo cumple las condiciones para aparecer en el catálogo.");
    expect(visibility.reasons).toEqual([]);
  });

  it("explains every authoritative blocker, in order", () => {
    const blockers = computeComboReadiness({
      ...ready,
      productPublicationStatus: "draft",
      compositionVerificationStatus: "pending_reconfirmation",
      itemCount: 0,
    });
    const visibility = comboVisibility(blockers);
    expect(visibility.visible).toBe(false);
    expect(visibility.headline).toBe("Este combo todavía no puede aparecer en la tienda.");
    expect(visibility.reasons).toEqual([
      COMBO_BLOCKER_OWNER_LABELS.product_unpublished,
      COMBO_BLOCKER_OWNER_LABELS.composition_unconfirmed,
      COMBO_BLOCKER_OWNER_LABELS.no_items,
    ]);
  });

  it("reads an archived combo as archived, not as a problem to fix", () => {
    const visibility = comboVisibility(computeComboReadiness({ ...ready, comboArchived: true }));
    expect(visibility.label).toBe("Archivado");
    expect(visibility.tone).toBe("neutral");
  });
});

describe("comboNextAction", () => {
  it("has no action when nothing blocks", () => {
    expect(comboNextAction([])).toBeNull();
  });

  it("uses only the first authoritative blocker", () => {
    const blockers = computeComboReadiness({ ...ready, productPublicationStatus: "draft", compositionVerificationStatus: "unknown" });
    expect(blockers[0]).toBe("product_unpublished");
    expect(comboNextAction(blockers)?.target).toEqual({ kind: "product" });
  });

  it.each<[ComboReadinessBlocker, unknown]>([
    ["combo_archived", { kind: "section", anchor: "#avanzado" }],
    ["product_archived", { kind: "product" }],
    ["product_unpublished", { kind: "product" }],
    ["composition_unconfirmed", { kind: "section", anchor: "#verificacion" }],
    ["no_items", { kind: "section", anchor: "#composicion" }],
    ["item_archived", { kind: "section", anchor: "#composicion" }],
  ])("routes %s to where it is fixed", (blocker, target) => {
    expect(comboNextAction([blocker])?.target).toEqual(target);
  });

  it("never suggests that saving a composition confirms it", () => {
    const action = comboNextAction(["composition_unconfirmed"]);
    expect(action?.detail).toMatch(/cliente confirme/);
  });
});

describe("comboPresentationLabel", () => {
  it("adds the size only when the label does not already say it", () => {
    expect(comboPresentationLabel({ label: "Set", sizeMl: 5 })).toBe("Set · 5 ml");
    expect(comboPresentationLabel({ label: "Set 5 ml", sizeMl: 5 })).toBe("Set 5 ml");
    expect(comboPresentationLabel({ label: "Set", sizeMl: null })).toBe("Set");
  });
});

describe("combo workspace contracts", () => {
  const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
  const workspace = read("../../app/admin/parfums/combos/[id]/combo-workspace.tsx");
  const editor = read("../../app/admin/parfums/combos/[id]/combo-editor.tsx");
  const composition = read("../../app/admin/parfums/combos/[id]/composition-manager.tsx");

  it("keeps ONE shared combo row: every mutating child reports back to the workspace", () => {
    expect(workspace).toMatch(/const \[combo, setCombo\] = useState\(initialCombo\)/);
    expect(workspace).toMatch(/comboUpdatedAt=\{combo\.updated_at\}/);
    expect(workspace).toMatch(/onComboChange=\{setCombo\}/);
    expect(workspace.match(/onChange=\{setCombo\}/g)).toHaveLength(2);
    // Children never keep their own copy of the concurrency token.
    expect(editor).not.toMatch(/useState\([^)]*updated_at/);
    expect(composition).not.toMatch(/useState\([^)]*updated_at/);
    expect(composition).toMatch(/onComboChange\(result\.data\.combo\)/);
  });

  it("renders official_pdf as read-only source authority", () => {
    expect(editor).toMatch(/isOfficialPdf \? \(\s*<Notice tone="healthy" title="Verificada por fuente oficial">/);
  });

  it("gates client confirmation behind an explicit acknowledgement", () => {
    expect(editor).toMatch(/needsAcknowledgement = dirty && status === "client_confirmed"/);
    expect(editor).toMatch(/\(!needsAcknowledgement \|\| acknowledged\)/);
  });

  it("asks for a second step before archiving", () => {
    expect(editor).toMatch(/Sí, archivar combo/);
    expect(editor).toMatch(/El producto asociado no se elimina ni se archiva/);
  });
});
