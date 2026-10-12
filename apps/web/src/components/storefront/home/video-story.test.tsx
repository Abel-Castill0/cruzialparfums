import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HomeVideo } from "@/domains/platform/home-video";
import { VideoStory } from "./video-story";

const base: HomeVideo = {
  tiktokUrl: "https://www.tiktok.com/@cruzial.parfum/video/7683916686390496533",
  title: "Cada detalle cuenta",
  text: "Texto de prueba.",
};

describe("VideoStory", () => {
  it("without a hosted file shows the TikTok cover and never renders the iframe up front", () => {
    const html = renderToStaticMarkup(<VideoStory video={base} tone="parfums" />);
    expect(html).toContain("Reproducir video");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<video");
  });

  it("with a hosted file plays a native <video> with controls: no iframe, no TikTok player URL, TikTok kept as a link", () => {
    const hosted = {
      sources: [
        { src: "https://res.cloudinary.com/demo/video/upload/v1/cruzial/parfums.mp4", type: "video/mp4" as const },
        { src: "https://res.cloudinary.com/demo/video/upload/v1/cruzial/parfums.webm", type: "video/webm" as const },
      ],
      poster: "https://res.cloudinary.com/demo/video/upload/so_0/cruzial/parfums.jpg",
    };
    const html = renderToStaticMarkup(<VideoStory video={{ ...base, hosted }} tone="parfums" />);
    expect(html).toContain("<video");
    expect(html).toContain("controls");
    expect(html.toLowerCase()).toContain("playsinline");
    expect(html).toContain('type="video/mp4"');
    expect(html).toContain('type="video/webm"');
    expect(html).toContain("data-hosted-video");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("tiktok.com/player");
    expect(html).toContain('href="https://www.tiktok.com/@cruzial.parfum/video/7683916686390496533"');
  });

  it("ignores a hosted file from an untrusted host and falls back to the TikTok cover", () => {
    const html = renderToStaticMarkup(
      <VideoStory video={{ ...base, hosted: { sources: [{ src: "https://example.com/a.mp4", type: "video/mp4" }] } }} tone="parfums" />,
    );
    expect(html).not.toContain("<video");
    expect(html).toContain("Reproducir video");
  });
});
