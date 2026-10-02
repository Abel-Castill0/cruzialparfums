"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  parseTikTokVideoId,
  tiktokEmbedUrl,
  type HomeVideo,
} from "@/domains/platform/home-video";
import styles from "./video-story.module.css";

/**
 * Video as a story: copy on one side, the portrait video on the other. The
 * TikTok player is a third-party iframe, so it loads only after the visitor
 * presses play — the page ships a poster and a button, nothing else.
 */
export function VideoStory({ video, tone }: { video: HomeVideo; tone: "parfums" | "import" }) {
  const [playing, setPlaying] = useState(false);
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
          {playing ? (
            <iframe
              className={styles.player}
              src={tiktokEmbedUrl(videoId)}
              title={video.title}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <button
              type="button"
              className={styles.poster}
              onClick={() => setPlaying(true)}
              aria-label={`Reproducir video: ${video.title}`}
            >
              <Image
                src={video.posterSrc}
                alt={video.posterAlt}
                fill
                sizes="(max-width: 767px) 78vw, 340px"
                className={styles.posterImage}
                loading="lazy"
              />
              <span className={styles.play} aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M5 3v10l8-5-8-5Z" />
                </svg>
              </span>
            </button>
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
