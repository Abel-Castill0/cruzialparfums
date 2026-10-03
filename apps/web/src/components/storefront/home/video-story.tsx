"use client";

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  parseTikTokVideoId,
  tiktokEmbedUrl,
  type HomeVideo,
} from "@/domains/platform/home-video";
import styles from "./video-story.module.css";

function handleOf(url: string) {
  return /tiktok\.com\/(@[\w.-]+)/.exec(url)?.[1] ?? "TikTok";
}

/**
 * Video as a story: copy on one side, the official TikTok player on the other.
 * The page always ships a visible cover with an evident play button. TikTok's
 * cross-origin player is mounted only after an intentional tap, avoiding
 * duplicate embed initialization during hydration/navigation and keeping its
 * trackers and cookie UI off the initial page load.
 */
export function VideoStory({ video, tone }: { video: HomeVideo; tone: "parfums" | "import" }) {
  const [playing, setPlaying] = useState(false);
  const videoId = parseTikTokVideoId(video.tiktokUrl);

  if (!videoId) return null;

  return (
    <section className={`${styles.story} ${styles[tone]}`} aria-labelledby="home-video-title" data-home-video={tone}>
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
          {!playing ? (
            <button className={styles.playGate} type="button" onClick={() => setPlaying(true)}>
              <small>TikTok · {handleOf(video.tiktokUrl)}</small>
              <span aria-hidden="true">▶</span>
              <strong>Reproducir video</strong>
              <span>{video.title}. El video se cargará desde TikTok al tocar.</span>
            </button>
          ) : (
            <iframe
              className={styles.player}
              src={tiktokEmbedUrl(videoId)}
              title={video.title}
              allow="fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              loading="lazy"
              data-tiktok-player
              referrerPolicy="strict-origin-when-cross-origin"
            />
          )}
        </div>
        <p className={styles.fallback}>
          Si el video no carga o TikTok bloquea la reproducción,{" "}
          <a href={video.tiktokUrl} target="_blank" rel="noopener noreferrer">ábrelo en TikTok</a>.
        </p>
      </div>
    </section>
  );
}
