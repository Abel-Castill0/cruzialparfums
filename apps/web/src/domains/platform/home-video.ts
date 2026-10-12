/**
 * Real audiovisual content for the storefront homes.
 *
 * Nothing here is invented: a home shows a video story only for a published
 * TikTok video that belongs to that unit, with an existing image as poster.
 *
 * - Import: the public "Tercer consolidado de perfumería" video (TikTok
 *   oEmbed title: "TERCER CONSOLIDADO DE PERFUMERÍA"), so it is presented as
 *   Import content only.
 * - Parfums: the owner supplied the exact public video and profile.
 * - Import: the owner supplied a separate video for the Import audience.
 */

/** A video file the business hosts itself (Cloudinary or this site), played by a native <video>: no third-party player. */
export type HostedVideo = {
  /** Same clip in the formats browsers need: MP4 (H.264, Safari/iOS/Chrome) and optionally WebM. Absolute https Cloudinary URLs or /root-relative paths. */
  sources: readonly { src: string; type: "video/mp4" | "video/webm" }[];
  poster?: string;
};

export type HomeVideo = {
  /** Public video URL, e.g. https://www.tiktok.com/@cruzial_parfum/video/<id>. */
  tiktokUrl: string;
  eyebrow?: string;
  title: string;
  text: string;
  cta?: { label: string; href: string };
  /**
   * When set, the story plays this file instead of loading the TikTok embed. The TikTok URL stays as the "Ver en TikTok"
   * link. TikTok's player is blocked by many ad blockers and tracking-protection settings (its telemetry hosts, e.g.
   * mon.tiktokv.com, return ERR_BLOCKED_BY_CLIENT and the player shows "Player error"); a file on our own media host is not.
   */
  hosted?: HostedVideo;
};

export const PARFUMS_HOME_VIDEO: HomeVideo | null = {
  tiktokUrl: "https://www.tiktok.com/@cruzial.parfum/video/7683916686390496533",
  title: "Cada detalle cuenta",
  text: "Conoce de cerca las fragancias y el cuidado detrás de cada pedido de Cruzial Parfums.",
};

export const IMPORT_HOME_VIDEO: HomeVideo | null = {
  tiktokUrl: "https://www.tiktok.com/@cruzialperu/video/7657015388252720402",
  eyebrow: "Consolidados anteriores",
  title: "Tercer consolidado de perfumería",
  text: "Mira cómo se presentó el tercer consolidado de perfumería de Cruzial Import, publicado en nuestro TikTok.",
};

/** Owner-provided public Parfums profile. */
export const CRUZIAL_TIKTOK_PROFILE = {
  url: "https://www.tiktok.com/@cruzial.parfum",
  handle: "@cruzial.parfum",
  name: "Cruzial Parfums",
} as const;

const HOSTED_VIDEO_SRC = /^(?:https:\/\/res\.cloudinary\.com\/[^\s"'<>]+|\/[^\s"'<>/][^\s"'<>]*)$/;

/** A hosted video is only trusted when every source (and the poster) is on Cloudinary or on this site. */
export function isValidHostedVideo(hosted: HostedVideo | undefined): hosted is HostedVideo {
  if (!hosted || hosted.sources.length === 0) return false;
  if (!hosted.sources.every((source) => HOSTED_VIDEO_SRC.test(source.src))) return false;
  return hosted.poster === undefined || HOSTED_VIDEO_SRC.test(hosted.poster);
}

function configuredHomeVideos(): HomeVideo[] {
  return [PARFUMS_HOME_VIDEO, IMPORT_HOME_VIDEO].filter((video): video is HomeVideo => video !== null);
}

/** True only while at least one home still plays through the TikTok embed (and so needs the frame-src exception). */
export function homeVideoNeedsTikTokFrame(): boolean {
  return configuredHomeVideos().some((video) => !isValidHostedVideo(video.hosted));
}

/** True while a home plays a hosted file, which needs Cloudinary in media-src. */
export function homeVideoUsesHostedMedia(): boolean {
  return configuredHomeVideos().some((video) => isValidHostedVideo(video.hosted));
}

const TIKTOK_VIDEO_URL = /^https:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d{8,25})(?:[/?#].*)?$/;

export function parseTikTokVideoId(url: string): string | null {
  return TIKTOK_VIDEO_URL.exec(url.trim())?.[1] ?? null;
}

export const TIKTOK_EMBED_ORIGIN = "https://www.tiktok.com";

/** Official embeddable player; only the numeric id ever reaches the URL. */
export function tiktokEmbedUrl(videoId: string): string {
  return `${TIKTOK_EMBED_ORIGIN}/player/v1/${videoId}?controls=1&autoplay=0&rel=0&music_info=0&description=0`;
}
