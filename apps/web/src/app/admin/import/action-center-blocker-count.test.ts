import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

function read(): string {
  return fs.readFileSync(path.resolve(process.cwd(), "src", "app", "admin", "import", "page.tsx"), "utf-8");
}

// Lead review P2: the dashboard's "producto(s) no publicado(s)" count used
// readiness.publication_blockers (a broader tally that also includes
// presentation_unpublished) while deep-linking to
// ?blocker=product_unpublished — the count and destination could disagree.
// The count must come from the exact same guarded RPC + blocker filter the
// destination page queries.
describe("Import Action Center product_unpublished count matches its link", () => {
  it("derives the count from admin_list_import_publication_blockers with p_blocker: product_unpublished", () => {
    const page = read();
    expect(page).toContain("admin_list_import_publication_blockers");
    expect(page).toMatch(/p_blocker:\s*"product_unpublished"/);
  });

  it("no longer sources the product_unpublished count from readiness.publication_blockers", () => {
    const page = read();
    expect(page).not.toContain("readiness.publication_blockers");
  });
});
