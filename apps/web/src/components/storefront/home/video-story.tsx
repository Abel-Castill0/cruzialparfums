"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  parseTikTokVideoId,
  tiktokEmbedUrl,
  type HomeVideo,
} from "@/domains/platform/home-video";
import styles from "./video-story.module.css";

/**
 * Video as a story: copy on one side, the official TikTok player on the other.
 * Lazy iframe loading avoids requesting the embed until the visitor reaches
 * this section, while leaving the video visible without an extra click.
 */
export function VideoStory({ video, tone }: { video: HomeVideo; tone: "parfums" | "import" }) {
  const videoId = parseTikTokVideoId(video.tiktokUrl);
  if (!videoId) return null;

  return (
    <section className={`${styles.story} ${styles[tone]}`} aria-labelledby="home-video-title">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>{video.eyebrow}</p>
          <h2 id="home-video-title">{video.title}</h2>
          <p>{video.text}</p>
          <div className={styles.actions}>
            <a href={video.tiktokUrl} target="_blank" rel="noopener noreferrer" className={styles.link}>
              Ver en TikTok <span aria-hidden="true">↗</span>
            </a>
            {video.cta ? (
              <Link href={video.cta.href as Route} className={styles.link}>
                {video.cta.label} <span aria-hidden="true">→</span>
              </Link>
            ) : null}
          </div>
        </div>

        <div className={styles.frame}>
          <iframe
            className={styles.player}
            src={tiktokEmbedUrl(videoId)}
            title={video.title}
            allow="fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <p className={styles.fallback}>
          Si el video no carga o TikTok bloquea la reproducción,{" "}
          <a href={video.tiktokUrl} target="_blank" rel="noopener noreferrer">ábrelo en TikTok</a>.
        </p>
      </div>
    </section>
  );
}
