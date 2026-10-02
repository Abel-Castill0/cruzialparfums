/**
 * Real audiovisual content for the storefront homes.
 *
 * Nothing here is invented: a home shows its video story only when the unit
 * has a published TikTok video AND a real poster image. Until the owner
 * supplies those, both constants stay `null` and the section does not render.
 */

export type HomeVideo = {
  /** Public video URL, e.g. https://www.tiktok.com/@cruzial_parfum/video/<id>. */
  tiktokUrl: string;
  /** Existing image in /public used before the visitor chooses to play. */
  posterSrc: string;
  posterAlt: string;
  eyebrow: string;
  title: string;
  text: string;
  cta?: { label: string; href: string };
};

export const PARFUMS_HOME_VIDEO: HomeVideo | null = null;
export const IMPORT_HOME_VIDEO: HomeVideo | null = null;

/** True only while at least one home actually has a video to frame. */
export function homeVideoNeedsTikTokFrame(): boolean {
  return PARFUMS_HOME_VIDEO !== null || IMPORT_HOME_VIDEO !== null;
}

const TIKTOK_VIDEO_URL = /^https:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d{8,25})(?:[/?#].*)?$/;

export function parseTikTokVideoId(url: string): string | null {
  return TIKTOK_VIDEO_URL.exec(url.trim())?.[1] ?? null;
}

export const TIKTOK_EMBED_ORIGIN = "https://www.tiktok.com";

/** Official embeddable player; only the numeric id ever reaches the URL. */
export function tiktokEmbedUrl(videoId: string): string {
  return `${TIKTOK_EMBED_ORIGIN}/player/v1/${videoId}?autoplay=1&rel=0&music_info=0&description=0`;
}
