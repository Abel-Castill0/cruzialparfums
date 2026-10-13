"use client";

import { useRef, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  isValidHostedVideo,
  parseTikTokVideoId,
  tiktokEmbedUrl,
  type HomeVideo,
} from "@/domains/platform/home-video";
import styles from "./video-story.module.css";

function handleOf(url: string) {
  return /tiktok\.com\/(@[\w.-]+)/.exec(url)?.[1] ?? "TikTok";
}

/**
 * Video as a story: copy on one side, the player on the other. A video with a hosted file (`video.hosted`, Cloudinary or this
 * site) plays in a native <video controls>: no third-party script, frame or telemetry, so ad blockers cannot break it. Without
 * a file it falls back to the official TikTok player behind a cover: the page always ships a visible cover with an evident
 * play button. TikTok's
 * cross-origin player is mounted only after an intentional tap, avoiding
 * duplicate embed initialization during hydration/navigation and keeping its
 * trackers and cookie UI off the initial page load.
 */
export function VideoStory({ video, tone }: { video: HomeVideo; tone: "parfums" | "import" }) {
  const [playing, setPlaying] = useState(false);
  // Hosted file: whether the <video> is paused (the big play button over the poster shows then; the native controls always stay).
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(true);
  const videoId = parseTikTokVideoId(video.tiktokUrl);
  const hosted = isValidHostedVideo(video.hosted) ? video.hosted : null;

  if (!videoId) return null;

  return (
    <section className={`${styles.story} ${styles[tone]}`} aria-labelledby="home-video-title" data-home-video={tone} data-band={tone === "parfums" ? "dark" : undefined}>
      <div className={styles.inner}>
        <div className={styles.copy}>
          {video.eyebrow ? <p className={styles.eyebrow}>{video.eyebrow}</p> : null}
          <h2 id="home-video-title">{video.title}</h2>
          <p>{video.text}</p>
          <div className={styles.actions}>
            <a href={video.tiktokUrl} target="_blank" rel="noopener noreferrer" className={styles.tiktokButton}>
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
          {hosted ? (
            <>
              <video
                ref={videoRef}
                className={`${styles.player} ${styles.hostedVideo}`}
                controls
                playsInline
                preload={hosted.poster ? "none" : "metadata"}
                poster={hosted.poster}
                aria-label={video.title}
                data-hosted-video
                onPlay={() => setPaused(false)}
                onPause={() => setPaused(true)}
                onEnded={() => setPaused(true)}
              >
                {hosted.sources.map((source) => <source key={source.src} src={source.src} type={source.type} />)}
                <a href={video.tiktokUrl} target="_blank" rel="noopener noreferrer">Ver el video en TikTok</a>
              </video>
              {/* Mouse and touch affordance only: keyboard and screen-reader users have the native controls. */}
              {paused ? (
                <button type="button" className={styles.bigPlay} tabIndex={-1} aria-hidden="true" onClick={() => void videoRef.current?.play()}>
                  <span>▶</span>
                </button>
              ) : null}
            </>
          ) : !playing ? (
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
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope; clipboard-write"
              loading="lazy"
              data-tiktok-player
              referrerPolicy="strict-origin-when-cross-origin"
            />
          )}
        </div>
        <p className={styles.fallback}>
          {hosted ? "También lo puedes ver en " : "Si el video no carga o TikTok bloquea la reproducción, "}
          <a href={video.tiktokUrl} target="_blank" rel="noopener noreferrer">{hosted ? "TikTok" : "ábrelo en TikTok"}</a>.
        </p>
      </div>
    </section>
  );
}
