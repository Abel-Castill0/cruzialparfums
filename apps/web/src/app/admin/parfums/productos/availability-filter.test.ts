import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd(), "src", "app", "admin", "parfums", "productos");

function read(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), "utf-8");
}

// Lead review P2: the Action Center deep-links to
// /admin/parfums/productos?availability=out_of_stock and the server already
// applies that filter, but ProductFilters didn't expose it — an invisible,
// sticky filter with no way to clear it from the UI. These assertions pin
// the wiring so the filter can't silently go invisible again.
describe("Parfums product list exposes the availability filter", () => {
  it("page.tsx passes availabilityStatus into ProductFilters' initial state", () => {
    const page = read("page.tsx");
    expect(page).toMatch(/initial=\{\{[^}]*availabilityStatus[^}]*\}\}/);
  });

  it("ProductFilters renders a Disponibilidad select mapped to the availability URL param", () => {
    const filters = read("product-filters.tsx");
    expect(filters).toContain("availabilityStatus");
    expect(filters).toContain("Disponibilidad");
    expect(filters).toContain('apply({ availability: event.target.value })');
    expect(filters).toContain('value="available"');
    expect(filters).toContain('value="out_of_stock"');
  });
});
