import { describe, expect, it } from "vitest";
import { parseTikTokVideoId, tiktokEmbedUrl } from "./home-video";

describe("home video helpers", () => {
  it("extracts the numeric id from a canonical TikTok video URL", () => {
    expect(parseTikTokVideoId("https://www.tiktok.com/@cruzial_parfum/video/7234567890123456789")).toBe(
      "7234567890123456789",
    );
    expect(parseTikTokVideoId("https://tiktok.com/@a.b-c/video/7234567890123456789?lang=es")).toBe(
      "7234567890123456789",
    );
  });

  it("rejects anything that is not a TikTok video URL", () => {
    for (const url of [
      "",
      "http://www.tiktok.com/@a/video/7234567890123456789",
      "https://www.tiktok.com.evil.test/@a/video/7234567890123456789",
      "https://www.tiktok.com/@a/video/abc",
      "https://www.tiktok.com/@a",
      "javascript:alert(1)",
    ]) {
      expect(parseTikTokVideoId(url)).toBeNull();
    }
  });

  it("builds the player URL from the numeric id only", () => {
    expect(tiktokEmbedUrl("7234567890123456789")).toBe(
      "https://www.tiktok.com/player/v1/7234567890123456789?autoplay=1&rel=0&music_info=0&description=0",
    );
  });
});
