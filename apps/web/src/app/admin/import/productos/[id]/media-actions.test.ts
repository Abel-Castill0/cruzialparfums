import { beforeEach, describe, expect, it, vi } from "vitest";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const EXPECTED_PUBLIC_ID = "cruzial/import/products/11111111-1111-4111-8111-111111111111/authorized-asset";

const mocks = vi.hoisted(() => ({
  requireUnitAdmin: vi.fn(),
  registerMock: vi.fn(),
  destroyAsset: vi.fn(),
  resolveAuthorizedUpload: vi.fn(),
  isUploadResultValid: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/admin-session", () => ({
  requireUnitAdmin: mocks.requireUnitAdmin,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/domains/admin-parfums/product-schema", () => ({
  isValidUuid: (value: unknown) => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value),
}));

vi.mock("@/domains/admin-parfums/media-repository", () => ({
  AdminParfumsMediaRepository: class {
    register = mocks.registerMock;
  },
}));

vi.mock("@/lib/media/cloudinary", () => ({
  createUploadAuthorization: vi.fn(),
  destroyAsset: mocks.destroyAsset,
  isUploadResultValid: mocks.isUploadResultValid,
  resolveAuthorizedUpload: mocks.resolveAuthorizedUpload,
}));

vi.mock("@/lib/media/cloudinary-env", () => ({
  readCloudinaryEnv: () => ({ cloudName: "cruzial-cloud", apiKey: "key", apiSecret: "secret" }),
}));

import { registerMediaAction, type CloudinaryUploadResult } from "./media-actions";

function uploadResult(overrides: Partial<CloudinaryUploadResult> = {}): CloudinaryUploadResult {
  return {
    publicId: EXPECTED_PUBLIC_ID,
    secureUrl: `https://res.cloudinary.com/cruzial-cloud/image/upload/${EXPECTED_PUBLIC_ID}.jpg`,
    width: 800,
    height: 600,
    bytes: 12_345,
    format: "jpg",
    ...overrides,
  };
}

describe("registerMediaAction (import) — destructive-cleanup replay regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUnitAdmin.mockResolvedValue({ ok: true });
  });

  it("never destroys a Cloudinary asset when the authorization token is invalid/expired", async () => {
    mocks.resolveAuthorizedUpload.mockReturnValue(null);

    const result = await registerMediaAction(PRODUCT_ID, null, uploadResult(), null, false, "bogus-token");

    expect(result.status).toBe("error");
    expect(mocks.destroyAsset).not.toHaveBeenCalled();
    expect(mocks.registerMock).not.toHaveBeenCalled();
  });

  it("never destroys a Cloudinary asset when a valid token is replayed with an invalid upload result", async () => {
    mocks.resolveAuthorizedUpload.mockReturnValue(EXPECTED_PUBLIC_ID);
    mocks.isUploadResultValid.mockReturnValue(false);

    const result = await registerMediaAction(
      PRODUCT_ID,
      null,
      uploadResult({ publicId: "cruzial/import/products/11111111-1111-4111-8111-111111111111/tampered" }),
      null,
      false,
      "still-valid-token",
    );

    expect(result.status).toBe("error");
    expect(mocks.destroyAsset).not.toHaveBeenCalled();
    expect(mocks.registerMock).not.toHaveBeenCalled();
  });

  it("still registers a valid upload against a valid token", async () => {
    mocks.resolveAuthorizedUpload.mockReturnValue(EXPECTED_PUBLIC_ID);
    mocks.isUploadResultValid.mockReturnValue(true);
    mocks.registerMock.mockResolvedValue({
      ok: true,
      data: { id: "media-1", product_id: PRODUCT_ID } as never,
    });

    const result = await registerMediaAction(PRODUCT_ID, null, uploadResult(), null, false, "valid-token");

    expect(result.status).toBe("success");
    expect(mocks.destroyAsset).not.toHaveBeenCalled();
    expect(mocks.registerMock).toHaveBeenCalledTimes(1);
  });
});
