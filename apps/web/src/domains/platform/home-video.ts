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

export type HomeVideo = {
  /** Public video URL, e.g. https://www.tiktok.com/@cruzial_parfum/video/<id>. */
  tiktokUrl: string;
  eyebrow: string;
  title: string;
  text: string;
  cta?: { label: string; href: string };
};

export const PARFUMS_HOME_VIDEO: HomeVideo | null = {
  tiktokUrl: "https://www.tiktok.com/@cruzial.parfum/video/7683916686390496533",
  eyebrow: "Detrás de cada pedido",
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
  return `${TIKTOK_EMBED_ORIGIN}/player/v1/${videoId}?controls=1&autoplay=0&rel=0&music_info=0&description=0`;
}
