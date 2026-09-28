import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

function read(): string {
  return fs.readFileSync(path.resolve(process.cwd(), "src", "app", "admin", "import", "page.tsx"), "utf-8");
}

// Lead review P2: a dashboard count must come from the exact same guarded
// RPC + blocker filter its destination queries — never from the readiness
// RPC's broader tallies (publication_blockers also includes
// presentation_unpublished; media_blockers counts differently), which could
// disagree with what the link actually shows. The count→link pairing itself
// is covered behaviorally in domains/admin-import/campaign-presentation.test.ts.
describe("Import dashboard blocker counts match their destination filter", () => {
  it("counts every blocker through admin_list_import_publication_blockers with its own p_blocker", () => {
    const page = read();
    expect(page).toContain("admin_list_import_publication_blockers");
    expect(page).toMatch(/p_blocker:\s*blocker/);
    for (const blocker of ["product_unpublished", "presentation_unpublished", "missing_primary_media", "missing_offer", "offer_invalid_price"]) {
      expect(page).toContain(`blockerTotal("${blocker}")`);
    }
  });

  it("never sources a linked count from the readiness RPC's broader tallies", () => {
    const page = read();
    expect(page).not.toContain("readiness.publication_blockers");
    expect(page).not.toContain("readiness.media_blockers");
    expect(page).not.toContain("readiness.commercial_blockers");
  });
});
