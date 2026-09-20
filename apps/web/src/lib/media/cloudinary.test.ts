import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createUploadAuthorization,
  isUploadResultValid,
  MAX_UPLOAD_BYTES,
  resolveAuthorizedUpload,
} from "./cloudinary";
import { readCloudinaryEnv } from "./cloudinary-env";

const ORIGINAL_ENV = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PRODUCT_ID = "22222222-2222-4222-8222-222222222222";

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
    expect(createUploadAuthorization(PRODUCT_ID)).toBeNull();
  });

  it("mints a public_id scoped to the given product id and never leaks the API secret", () => {
    const auth = createUploadAuthorization(PRODUCT_ID);
    expect(auth).not.toBeNull();
    expect(auth?.publicId.startsWith(`cruzial/parfums/products/${PRODUCT_ID}/`)).toBe(true);
    expect(auth?.cloudName).toBe("demo");
    expect(auth?.apiKey).toBe("key123");
    expect(JSON.stringify(auth)).not.toContain("topsecret");
  });

  it("mints a different public_id on every call (no reuse across uploads)", () => {
    const first = createUploadAuthorization(PRODUCT_ID);
    const second = createUploadAuthorization(PRODUCT_ID);
    expect(first?.publicId).not.toBe(second?.publicId);
  });

  it("produces a signature matching Cloudinary's documented sha1(sorted params + secret) scheme", () => {
    const auth = createUploadAuthorization(OTHER_PRODUCT_ID);
    expect(auth).not.toBeNull();
    if (!auth) return;

    const expected = createHash("sha1")
      .update(`allowed_formats=${auth.allowedFormats}&public_id=${auth.publicId}&timestamp=${auth.timestamp}topsecret`)
      .digest("hex");

    expect(auth.signature).toBe(expected);
  });

  it("restricts uploads to jpg/jpeg/png/webp only", () => {
    const auth = createUploadAuthorization(PRODUCT_ID);
    expect(auth?.allowedFormats).toBe("jpg,jpeg,png,webp");
  });
});

describe("resolveAuthorizedUpload (authorization token provenance)", () => {
  beforeEach(() => {
    setEnv({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "key123", CLOUDINARY_API_SECRET: "topsecret" });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("recovers the server-minted public_id for a valid token/product/unit", () => {
    const auth = createUploadAuthorization(PRODUCT_ID);
    expect(auth).not.toBeNull();
    if (!auth) return;

    expect(resolveAuthorizedUpload(auth.authorizationToken, PRODUCT_ID)).toBe(auth.publicId);
  });

  it("rejects a token when the product id does not match (cross-product replay)", () => {
    const auth = createUploadAuthorization(PRODUCT_ID);
    if (!auth) throw new Error("expected authorization");
    expect(resolveAuthorizedUpload(auth.authorizationToken, OTHER_PRODUCT_ID)).toBeNull();
  });

  it("rejects a token when the unit does not match (cross-business-unit replay)", () => {
    const auth = createUploadAuthorization(PRODUCT_ID, "parfums");
    if (!auth) throw new Error("expected authorization");
    expect(resolveAuthorizedUpload(auth.authorizationToken, PRODUCT_ID, "import")).toBeNull();
  });

  it("rejects a tampered token (payload edited without re-signing)", () => {
    const auth = createUploadAuthorization(PRODUCT_ID);
    if (!auth) throw new Error("expected authorization");
    const [encoded, mac] = auth.authorizationToken.split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    payload.publicId = `cruzial/parfums/products/${PRODUCT_ID}/some-other-existing-asset`;
    const forgedEncoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const forgedToken = `${forgedEncoded}.${mac}`;

    expect(resolveAuthorizedUpload(forgedToken, PRODUCT_ID)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(resolveAuthorizedUpload("not-a-real-token", PRODUCT_ID)).toBeNull();
  });

  it("rejects an expired token", () => {
    // Mint with a secret, then hand-craft an already-expired payload signed
    // with the same secret to simulate real expiry without waiting.
    const env = readCloudinaryEnv();
    if (!env) throw new Error("expected env");
    const payload = { publicId: `cruzial/parfums/products/${PRODUCT_ID}/abc`, productId: PRODUCT_ID, unitCode: "parfums", expiresAt: Math.floor(Date.now() / 1000) - 10 };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const mac = createHmac("sha256", env.apiSecret).update(encoded).digest("base64url");
    const expiredToken = `${encoded}.${mac}`;

    expect(resolveAuthorizedUpload(expiredToken, PRODUCT_ID)).toBeNull();
  });
});

describe("isUploadResultValid", () => {
  const cloudName = "demo";
  const expectedPublicId = `cruzial/parfums/products/${PRODUCT_ID}/abc123`;
  const validSecureUrl = `https://res.cloudinary.com/${cloudName}/image/upload/v1700000000/${expectedPublicId}.jpg`;

  it("accepts a result whose public_id, secure_url, format and size all match what was authorized", () => {
    expect(
      isUploadResultValid({
        publicId: expectedPublicId,
        secureUrl: validSecureUrl,
        format: "jpg",
        bytes: 1024,
        expectedPublicId,
        cloudName,
      }),
    ).toBe(true);
  });

  it("accepts a secure_url with no version segment", () => {
    const url = `https://res.cloudinary.com/${cloudName}/image/upload/${expectedPublicId}.jpg`;
    expect(
      isUploadResultValid({ publicId: expectedPublicId, secureUrl: url, format: "jpg", bytes: 1024, expectedPublicId, cloudName }),
    ).toBe(true);
  });

  it("rejects a public_id that does not exactly match the authorized one (existing-asset substitution attempt)", () => {
    const otherExistingAssetId = `cruzial/parfums/products/${PRODUCT_ID}/some-other-existing-asset`;
    expect(
      isUploadResultValid({
        publicId: otherExistingAssetId,
        secureUrl: `https://res.cloudinary.com/${cloudName}/image/upload/${otherExistingAssetId}.jpg`,
        format: "jpg",
        bytes: 1024,
        expectedPublicId,
        cloudName,
      }),
    ).toBe(false);
  });

  it("rejects a secure_url on an external host", () => {
    const url = `https://evil.example.com/${cloudName}/image/upload/${expectedPublicId}.jpg`;
    expect(
      isUploadResultValid({ publicId: expectedPublicId, secureUrl: url, format: "jpg", bytes: 1024, expectedPublicId, cloudName }),
    ).toBe(false);
  });

  it("rejects a secure_url under the wrong Cloudinary cloud name", () => {
    const url = `https://res.cloudinary.com/some-other-cloud/image/upload/${expectedPublicId}.jpg`;
    expect(
      isUploadResultValid({ publicId: expectedPublicId, secureUrl: url, format: "jpg", bytes: 1024, expectedPublicId, cloudName }),
    ).toBe(false);
  });

  it("rejects a secure_url whose path does not match the expected public_id (wrong folder/id)", () => {
    const url = `https://res.cloudinary.com/${cloudName}/image/upload/cruzial/parfums/products/${OTHER_PRODUCT_ID}/abc123.jpg`;
    expect(
      isUploadResultValid({ publicId: expectedPublicId, secureUrl: url, format: "jpg", bytes: 1024, expectedPublicId, cloudName }),
    ).toBe(false);
  });

  it("rejects a secure_url over plain http", () => {
    const url = `http://res.cloudinary.com/${cloudName}/image/upload/${expectedPublicId}.jpg`;
    expect(
      isUploadResultValid({ publicId: expectedPublicId, secureUrl: url, format: "jpg", bytes: 1024, expectedPublicId, cloudName }),
    ).toBe(false);
  });

  it("rejects a disallowed format", () => {
    const url = `https://res.cloudinary.com/${cloudName}/image/upload/${expectedPublicId}.gif`;
    expect(
      isUploadResultValid({ publicId: expectedPublicId, secureUrl: url, format: "gif", bytes: 1024, expectedPublicId, cloudName }),
    ).toBe(false);
  });

  it("rejects zero, negative, and oversized byte counts", () => {
    expect(
      isUploadResultValid({ publicId: expectedPublicId, secureUrl: validSecureUrl, format: "jpg", bytes: 0, expectedPublicId, cloudName }),
    ).toBe(false);
    expect(
      isUploadResultValid({ publicId: expectedPublicId, secureUrl: validSecureUrl, format: "jpg", bytes: -5, expectedPublicId, cloudName }),
    ).toBe(false);
    expect(
      isUploadResultValid({
        publicId: expectedPublicId,
        secureUrl: validSecureUrl,
        format: "jpg",
        bytes: MAX_UPLOAD_BYTES + 1,
        expectedPublicId,
        cloudName,
      }),
    ).toBe(false);
  });

  it("accepts a byte count exactly at the maximum", () => {
    expect(
      isUploadResultValid({
        publicId: expectedPublicId,
        secureUrl: validSecureUrl,
        format: "jpg",
        bytes: MAX_UPLOAD_BYTES,
        expectedPublicId,
        cloudName,
      }),
    ).toBe(true);
  });
});
