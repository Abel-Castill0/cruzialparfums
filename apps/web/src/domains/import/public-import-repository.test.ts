import { describe, expect, it } from "vitest";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { PublicImportRepository } from "./public-import-repository";
import type { PublicImportFilters } from "./public-import";

// Codex P1 review: readCatalog() reads "current campaign" and "catalog
// page" as two independent statements. If a consolidado rolls over between
// them, the catalog RPC (server-side) can return the NEXT campaign's rows
// while the earlier campaign read is still A. This suite proves the
// repository never returns a result pairing campaign A's identity with
// campaign B's offer rows — it either resolves to a coherent read (via one
// bounded retry) or fails closed to {status: "error"}.

type RpcCall = { data: unknown; error: PostgrestError | null };

const filters: PublicImportFilters = { query: "", category: "", page: 1 };

const campaignA = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  number: 6,
  name: "Consolidado 6",
  opens_at: null,
  closes_at: null,
  public_message: null,
};

const campaignB = {
  id: "bbbbbbbb-0000-4000-8000-000000000002",
  number: 7,
  name: "Consolidado 7",
  opens_at: null,
  closes_at: null,
  public_message: null,
};

function presentationFor(offerId: string) {
  return {
    id: `presentation-${offerId}`,
    offerId,
    offerUpdatedAt: "2026-09-10T12:00:00Z",
    label: "100 ml",
    class: "single_fixed",
    capacityMl: 100,
    price: "210.00",
    currency: "PEN",
    availability: "available",
  };
}

function catalogRowFor(campaign: typeof campaignA, offerId: string) {
  return {
    product_id: `product-${offerId}`,
    slug: `product-${offerId}`,
    name: `Product ${offerId}`,
    brand: "Brand",
    category_slug: null,
    category_name: null,
    media_url: null,
    media_alt: null,
    presentations: [presentationFor(offerId)],
    campaign_id: campaign.id,
    campaign_number: campaign.number,
    total_count: 1,
  };
}

const emptyCategories: RpcCall = { data: [], error: null };
const rpcError: PostgrestError = {
  name: "PostgrestError",
  message: "boom",
  details: "",
  hint: "",
  code: "500",
};

/** Queues one scripted response per rpc name per attempt; each call to a
 * given name advances to the next queued response for that name. Throws if
 * a name is called more times than scripted, so an accidental extra
 * (unbounded) retry fails the test loudly instead of silently reusing the
 * last response. */
function fakeSupabase(script: {
  campaign: RpcCall[];
  categories: RpcCall[];
  catalog: RpcCall[];
}): SupabaseClient<Database> {
  const cursors = { campaign: 0, categories: 0, catalog: 0 };
  const nameToKey: Record<string, keyof typeof script> = {
    public_get_import_current_campaign: "campaign",
    public_list_import_categories: "categories",
    public_list_import_catalog: "catalog",
  };
  const rpc = (name: string) => {
    const key = nameToKey[name];
    if (!key) throw new Error(`unexpected rpc: ${name}`);
    const queue = script[key];
    const index = cursors[key]++;
    const call = queue[index];
    if (!call) throw new Error(`rpc ${name} called more times (${index + 1}) than scripted (${queue.length})`);
    return Promise.resolve(call);
  };
  return { rpc } as unknown as SupabaseClient<Database>;
}

describe("PublicImportRepository.readCatalog — campaign/offer identity race (Codex P1)", () => {
  it("coherent read (no rollover): campaign and offers agree on the first attempt", async () => {
    const repo = new PublicImportRepository(
      fakeSupabase({
        campaign: [{ data: [campaignA], error: null }],
        categories: [emptyCategories],
        catalog: [{ data: [catalogRowFor(campaignA, "1")], error: null }],
      }),
    );

    const result = await repo.readCatalog(filters);
    expect(result.status).toBe("active");
    if (result.status === "active") {
      expect(result.campaign.id).toBe(campaignA.id);
      expect(result.products).toHaveLength(1);
    }
  });

  it("A -> B mismatch, retry lands on coherent B: returns campaign B paired with B's own offers, never A", async () => {
    const repo = new PublicImportRepository(
      fakeSupabase({
        // Attempt 1: campaign read says A, but the catalog (rolled over
        // server-side) already returns B's rows -> mismatch, must retry.
        campaign: [
          { data: [campaignA], error: null },
          { data: [campaignB], error: null },
        ],
        categories: [emptyCategories, emptyCategories],
        catalog: [
          { data: [catalogRowFor(campaignB, "1")], error: null },
          { data: [catalogRowFor(campaignB, "1")], error: null },
        ],
      }),
    );

    const result = await repo.readCatalog(filters);
    expect(result.status).toBe("active");
    if (result.status === "active") {
      // The coherent result must be entirely B — never A's identity paired
      // with B's offers.
      expect(result.campaign.id).toBe(campaignB.id);
      expect(result.products).toHaveLength(1);
    }
  });

  it("persistent mismatch across both attempts fails closed to an error state, never a mixed result", async () => {
    const repo = new PublicImportRepository(
      fakeSupabase({
        campaign: [
          { data: [campaignA], error: null },
          { data: [campaignA], error: null },
        ],
        categories: [emptyCategories, emptyCategories],
        catalog: [
          { data: [catalogRowFor(campaignB, "1")], error: null },
          { data: [catalogRowFor(campaignB, "1")], error: null },
        ],
      }),
    );

    const result = await repo.readCatalog(filters);
    expect(result).toEqual({ status: "error" });
  });

  it("never retries more than once — a third rpc call would throw in this harness", async () => {
    const repo = new PublicImportRepository(
      fakeSupabase({
        campaign: [
          { data: [campaignA], error: null },
          { data: [campaignA], error: null },
        ],
        categories: [emptyCategories, emptyCategories],
        catalog: [
          { data: [catalogRowFor(campaignB, "1")], error: null },
          { data: [catalogRowFor(campaignB, "1")], error: null },
        ],
      }),
    );

    // Would throw "called more times than scripted" if readCatalog issued
    // a third attempt instead of failing closed after the second.
    await expect(repo.readCatalog(filters)).resolves.toEqual({ status: "error" });
  });

  it("a genuinely empty catalog page is not a mismatch — no retry, campaign A remains the display context", async () => {
    const repo = new PublicImportRepository(
      fakeSupabase({
        campaign: [{ data: [campaignA], error: null }],
        categories: [emptyCategories],
        catalog: [{ data: [], error: null }],
      }),
    );

    const result = await repo.readCatalog(filters);
    expect(result.status).toBe("active");
    if (result.status === "active") {
      expect(result.campaign.id).toBe(campaignA.id);
      expect(result.products).toHaveLength(0);
    }
  });

  it("a campaign lookup error still fails closed immediately, without retrying", async () => {
    const repo = new PublicImportRepository(
      fakeSupabase({
        campaign: [{ data: null, error: rpcError }],
        categories: [],
        catalog: [],
      }),
    );

    await expect(repo.readCatalog(filters)).resolves.toEqual({ status: "error" });
  });
});
