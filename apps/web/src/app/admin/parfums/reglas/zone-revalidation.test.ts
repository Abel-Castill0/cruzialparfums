import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Structural guard (same idea as the import-campaign one): every admin action that changes a delivery zone must expire the
// `delivery-zones` cache tag, or the checkout keeps the old list until the fallback TTL.
const source = readFileSync(join(process.cwd(), "src/app/admin/parfums/reglas/actions.ts"), "utf8");

function body(name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const next = source.indexOf("export async function ", start + 10);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("delivery zone actions expire the checkout cache", () => {
  it.each(["saveDeliveryZoneAction", "deleteDeliveryZoneAction"])("%s calls revalidateDeliveryZones after the RPC succeeded", (name) => {
    const text = body(name);
    const rpc = text.indexOf("supabase.rpc(");
    const errorReturn = text.indexOf("if (error) return");
    const revalidate = text.indexOf("revalidateDeliveryZones()");
    expect(rpc).toBeGreaterThan(-1);
    expect(revalidate).toBeGreaterThan(errorReturn);
    expect(errorReturn).toBeGreaterThan(rpc);
  });

  it("agency and rule actions do not need the zone tag", () => {
    expect(body("saveShippingAgencyAction")).not.toContain("revalidateDeliveryZones");
  });
});
