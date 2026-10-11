import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

// Next 16 streams async generateMetadata into <body> for user agents that are not "HTML-limited bots". The root
// layout's metadata is async (it reads the owner's indexing switch), so on Production the <title>, description and
// robots tags missed <head> for browsers and tools such as Lighthouse (2026-10-11). htmlLimitedBots: /.*/ turns
// streaming off for every user agent. This guard keeps that setting; the real check is e2e/public-hub.spec.ts run
// against the deployed site.
describe("next.config metadata streaming", () => {
  it("treats every user agent as an HTML-limited bot so metadata stays in <head>", () => {
    const re = nextConfig.htmlLimitedBots;
    expect(re).toBeInstanceOf(RegExp);
    for (const ua of [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
      "curl/8.19.0",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    ]) {
      expect((re as RegExp).test(ua), ua).toBe(true);
    }
  });
});
