import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag, unstable_cache: (fn: unknown) => fn }));

import { IMPORT_CAMPAIGN_CACHE_TAG, IMPORT_CAMPAIGN_REVALIDATE_SECONDS } from "./import-campaign-cache";
import { revalidateImportCampaign } from "./import-campaign-revalidate";

describe("import-campaign cache policy", () => {
  beforeEach(() => revalidateTag.mockClear());

  it("uses the import-campaign tag with a 5 minute TTL as the fallback", () => {
    expect(IMPORT_CAMPAIGN_CACHE_TAG).toBe("import-campaign");
    expect(IMPORT_CAMPAIGN_REVALIDATE_SECONDS).toBe(300);
  });

  it("revalidateImportCampaign expires the tag immediately", () => {
    revalidateImportCampaign();
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith("import-campaign", { expire: 0 });
  });
});
