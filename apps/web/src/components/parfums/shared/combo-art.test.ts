import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMBO_ART, COMBO_SET_ART } from "./combo-art";

const PUBLIC_DIR = join(process.cwd(), "public");

// The three curated sets' own artwork is client-supplied and must not be
// re-encoded, cropped or replaced. Changing a file means changing this pin on
// purpose, in review.
const SET_ART_SHA256: Record<string, string> = {
  "combo-cuarteto": "50964f03f91640aeec66f5b282db2e5b64a58696c76fd7ed06ccc54da503a385",
  "combo-tulum": "556ddef132118c77d9db1b89693655c86a3a8b1643a3f0959ac252e0be6891e0",
  "combo-vainilla": "4bdae3f636a7df5371c4d4546579f54a6b60f7b96cc624d632d7855e40efabf9",
};

describe("combo artwork", () => {
  it("maps every curated set to an existing file", () => {
    for (const art of [...Object.values(COMBO_SET_ART), ...Object.values(COMBO_ART)]) {
      expect(existsSync(join(PUBLIC_DIR, art.src)), art.src).toBe(true);
    }
  });

  it("keeps the supplied set artwork byte-for-byte", () => {
    for (const [slug, art] of Object.entries(COMBO_SET_ART)) {
      const digest = createHash("sha256").update(readFileSync(join(PUBLIC_DIR, art.src))).digest("hex");
      expect(digest, slug).toBe(SET_ART_SHA256[slug]);
    }
  });
});
