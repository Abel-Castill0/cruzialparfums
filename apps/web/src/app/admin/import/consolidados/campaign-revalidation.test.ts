import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: every campaign action that revalidates an admin page also expires the public `import-campaign` tag, so the
 * gateway (`readImportGate`) never shows an old campaign state. A new action that forgets the call fails here.
 */
const source = readFileSync(join(__dirname, "actions.ts"), "utf8");
const actions = source
  .split(/^export async function /m)
  .slice(1)
  .map((chunk) => ({ name: chunk.slice(0, chunk.indexOf("(")), body: chunk }));

describe("Import campaign admin actions", () => {
  it("covers the seven mutating actions", () => {
    const writers = actions.filter((action) => action.body.includes("revalidatePath("));
    expect(writers.map((action) => action.name).sort()).toEqual([
      "archiveCampaignAction",
      "createCampaignAction",
      "duplicateCampaignAction",
      "setCampaignProductsAction",
      "setCampaignStatusAction",
      "updateCampaignAction",
      "updatePresentationOfferAction",
    ]);
  });

  it("every action that revalidates admin pages also calls revalidateImportCampaign()", () => {
    for (const action of actions.filter((entry) => entry.body.includes("revalidatePath("))) {
      expect(action.body, `${action.name} must call revalidateImportCampaign()`).toContain("revalidateImportCampaign();");
    }
  });

  it("the helper is called after the mutation succeeded, never before the result is checked", () => {
    for (const action of actions.filter((entry) => entry.body.includes("revalidateImportCampaign();"))) {
      const call = action.body.indexOf("revalidateImportCampaign();");
      const check = action.body.search(/if \(!result\.ok\)|result\.ok/);
      expect(check, `${action.name} checks the result`).toBeGreaterThanOrEqual(0);
      expect(call, `${action.name} revalidates after the check`).toBeGreaterThan(check);
    }
  });
});

describe("readImportGate", () => {
  it("is cached under the import-campaign tag", () => {
    const gate = readFileSync(join(__dirname, "../../../../lib/catalog/import-gate.ts"), "utf8");
    expect(gate).toContain("tags: [IMPORT_CAMPAIGN_CACHE_TAG]");
    expect(gate).toContain("revalidate: IMPORT_CAMPAIGN_REVALIDATE_SECONDS");
  });
});
