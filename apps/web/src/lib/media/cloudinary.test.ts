import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUploadAuthorization, isUploadResultValid, MAX_UPLOAD_BYTES } from "./cloudinary";
import { readCloudinaryEnv } from "./cloudinary-env";

const ORIGINAL_ENV = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("cloudinary env contract", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns null (never throws) when unconfigured", () => {
    setEnv({ CLOUDINARY_CLOUD_NAME: undefined, CLOUDINARY_API_KEY: undefined, CLOUDINARY_API_SECRET: undefined });
    expect(readCloudinaryEnv()).toBeNull();
  });

  it("returns null when only partially configured", () => {
    setEnv({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: undefined, CLOUDINARY_API_SECRET: "secret" });
    expect(readCloudinaryEnv()).toBeNull();
  });

  it("reads all three values when fully configured", () => {
    setEnv({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "key123", CLOUDINARY_API_SECRET: "secret456" });
    expect(readCloudinaryEnv()).toEqual({ cloudName: "demo", apiKey: "key123", apiSecret: "secret456" });
  });
});

describe("createUploadAuthorization", () => {
  beforeEach(() => {
    setEnv({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "key123", CLOUDINARY_API_SECRET: "topsecret" });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns null when Cloudinary is not configured", () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    expect(createUploadAuthorization("11111111-1111-4111-8111-111111111111")).toBeNull();
  });

  it("scopes the folder to the given product id and never leaks the API secret", () => {
    const auth = createUploadAuthorization("11111111-1111-4111-8111-111111111111");
    expect(auth).not.toBeNull();
    expect(auth?.folder).toBe("cruzial/parfums/products/11111111-1111-4111-8111-111111111111");
    expect(auth?.cloudName).toBe("demo");
    expect(auth?.apiKey).toBe("key123");
    expect(JSON.stringify(auth)).not.toContain("topsecret");
  });

  it("produces a signature matching Cloudinary's documented sha1(sorted params + secret) scheme", () => {
    const auth = createUploadAuthorization("22222222-2222-4222-8222-222222222222");
    expect(auth).not.toBeNull();
    if (!auth) return;

    const expected = createHash("sha1")
      .update(
        `allowed_formats=${auth.allowedFormats}&folder=${auth.folder}&timestamp=${auth.timestamp}topsecret`,
      )
      .digest("hex");

    expect(auth.signature).toBe(expected);
  });

  it("restricts uploads to jpg/jpeg/png/webp only", () => {
    const auth = createUploadAuthorization("11111111-1111-4111-8111-111111111111");
    expect(auth?.allowedFormats).toBe("jpg,jpeg,png,webp");
  });
});

describe("isUploadResultValid", () => {
  const productId = "11111111-1111-4111-8111-111111111111";
  const validPublicId = `cruzial/parfums/products/${productId}/abc123`;

  it("accepts a result scoped to the product's own folder, an allowed format, and a sane size", () => {
    expect(
      isUploadResultValid({ publicId: validPublicId, format: "jpg", bytes: 1024, productId }),
    ).toBe(true);
  });

  it("rejects a public_id outside the product's folder (a forged/mismatched association)", () => {
    const otherProductId = "22222222-2222-4222-8222-222222222222";
    expect(
      isUploadResultValid({
        publicId: `cruzial/parfums/products/${otherProductId}/abc123`,
        format: "jpg",
        bytes: 1024,
        productId,
      }),
    ).toBe(false);
  });

  it("rejects a disallowed format", () => {
    expect(
      isUploadResultValid({ publicId: validPublicId, format: "gif", bytes: 1024, productId }),
    ).toBe(false);
  });

  it("rejects zero, negative, and oversized byte counts", () => {
    expect(isUploadResultValid({ publicId: validPublicId, format: "png", bytes: 0, productId })).toBe(false);
    expect(isUploadResultValid({ publicId: validPublicId, format: "png", bytes: -5, productId })).toBe(false);
    expect(
      isUploadResultValid({ publicId: validPublicId, format: "png", bytes: MAX_UPLOAD_BYTES + 1, productId }),
    ).toBe(false);
  });

  it("accepts a byte count exactly at the maximum", () => {
    expect(
      isUploadResultValid({ publicId: validPublicId, format: "webp", bytes: MAX_UPLOAD_BYTES, productId }),
    ).toBe(true);
  });
});
