import { describe, expect, it } from "vitest";
import {
  IMPORT_HOME_VIDEO,
  PARFUMS_HOME_VIDEO,
  CRUZIAL_TIKTOK_PROFILE,
  homeVideoNeedsTikTokFrame,
  cloudinaryHostedVideo,
  homeVideoUsesHostedMedia,
  isValidHostedVideo,
  parseTikTokVideoId,
  tiktokEmbedUrl,
} from "./home-video";

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

  it("keeps each business unit on its own exact, valid TikTok video", () => {
    expect(IMPORT_HOME_VIDEO?.tiktokUrl).toBe("https://www.tiktok.com/@cruzialperu/video/7657015388252720402");
    expect(parseTikTokVideoId(IMPORT_HOME_VIDEO!.tiktokUrl)).toBe("7657015388252720402");
    expect(PARFUMS_HOME_VIDEO?.tiktokUrl).toBe("https://www.tiktok.com/@cruzial.parfum/video/7683916686390496533");
    expect(parseTikTokVideoId(PARFUMS_HOME_VIDEO!.tiktokUrl)).toBe("7683916686390496533");
    expect(CRUZIAL_TIKTOK_PROFILE.url).toBe("https://www.tiktok.com/@cruzial.parfum");
    expect(homeVideoNeedsTikTokFrame()).toBe(true);
  });

  it("builds the player URL from the numeric id only", () => {
    expect(tiktokEmbedUrl("7234567890123456789")).toBe(
      "https://www.tiktok.com/player/v1/7234567890123456789?controls=1&autoplay=0&rel=0&music_info=0&description=0",
    );
  });

  it("trusts a hosted video only when every source and the poster are on Cloudinary or on this site", () => {
    const mp4 = (src: string) => ({ sources: [{ src, type: "video/mp4" as const }] });
    expect(isValidHostedVideo(mp4("https://res.cloudinary.com/demo/video/upload/v1/cruzial/parfums.mp4"))).toBe(true);
    expect(isValidHostedVideo(mp4("/videos/parfums.mp4"))).toBe(true);
    expect(isValidHostedVideo({ ...mp4("/videos/parfums.mp4"), poster: "https://res.cloudinary.com/demo/image/upload/p.jpg" })).toBe(true);
    for (const bad of [
      "http://res.cloudinary.com/demo/video/upload/a.mp4",
      "https://res.cloudinary.com.evil.test/a.mp4",
      "https://example.com/a.mp4",
      "//evil.test/a.mp4",
      "javascript:alert(1)",
      "",
    ]) {
      expect(isValidHostedVideo(mp4(bad)), bad).toBe(false);
    }
    expect(isValidHostedVideo({ ...mp4("/videos/parfums.mp4"), poster: "https://example.com/p.jpg" })).toBe(false);
    expect(isValidHostedVideo({ sources: [] })).toBe(false);
    expect(isValidHostedVideo(undefined)).toBe(false);
  });

  it("ships with TikTok as the player until the owner supplies the video files", () => {
    expect(PARFUMS_HOME_VIDEO?.hosted).toBeUndefined();
    expect(IMPORT_HOME_VIDEO?.hosted).toBeUndefined();
    expect(homeVideoUsesHostedMedia()).toBe(false);
  });

  it("builds MP4, WebM and poster URLs from a Cloudinary public ID, and they pass the host check", () => {
    const hosted = cloudinaryHostedVideo({ cloudName: "demo-cloud", publicId: "cruzial/parfums-detalle" });
    expect(hosted.sources.map((source) => source.type)).toEqual(["video/mp4", "video/webm"]);
    expect(hosted.sources[0]!.src).toBe("https://res.cloudinary.com/demo-cloud/video/upload/vc_h264,q_auto,w_720/cruzial/parfums-detalle.mp4");
    expect(hosted.poster).toBe("https://res.cloudinary.com/demo-cloud/video/upload/so_1,w_720/cruzial/parfums-detalle.jpg");
    expect(isValidHostedVideo(hosted)).toBe(true);
  });

  it("refuses a cloud name or public ID that could point somewhere else", () => {
    expect(() => cloudinaryHostedVideo({ cloudName: "demo.evil.test", publicId: "a" })).toThrow();
    expect(() => cloudinaryHostedVideo({ cloudName: "demo", publicId: "../a" })).toThrow();
    expect(() => cloudinaryHostedVideo({ cloudName: "demo", publicId: "a b" })).toThrow();
    expect(() => cloudinaryHostedVideo({ cloudName: "", publicId: "a" })).toThrow();
  });
});
