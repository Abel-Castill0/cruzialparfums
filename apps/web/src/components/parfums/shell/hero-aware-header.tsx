"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Dispatched by the hero's navigation button to bring the header in. */
export const SHOW_PARFUMS_HEADER_EVENT = "cruzial:show-parfums-header";

const HOME_PATH = "/parfums";
// Tall enough to cover the sticky header, so it appears the moment the hero
// no longer reaches the top of the viewport.
const HEADER_REVEAL_MARGIN = "-80px 0px 0px 0px";

/**
 * Header for every Parfums page. It is always visible and sticky — except on
 * the home, where the hero owns the first screen. There the header stays out
 * of sight until the hero scrolls away, the visitor asks for it with the
 * hero's menu button, or keyboard focus enters it. Once shown it does not
 * hide again on scroll: it behaves the same for pointer, keyboard and
 * assistive technology, and never fights an open search, cart or menu.
 */
export function HeroAwareHeader({
  className,
  overHeroClassName,
  hiddenClassName,
  children,
}: {
  className: string | undefined;
  overHeroClassName: string | undefined;
  hiddenClassName: string | undefined;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const overHero = pathname === HOME_PATH;
  const headerRef = useRef<HTMLElement>(null);
  const [heroGone, setHeroGone] = useState(false);
  const [pinnedOn, setPinnedOn] = useState<string | null>(null);
  const [focusInside, setFocusInside] = useState(false);

  useEffect(() => {
    if (!overHero) return undefined;
    const hero = document.querySelector("[data-home-hero]");
    if (!hero) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroGone(!entry?.isIntersecting),
      { rootMargin: HEADER_REVEAL_MARGIN, threshold: 0 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [overHero]);

  useEffect(() => {
    const show = () => {
      setPinnedOn(window.location.pathname);
      requestAnimationFrame(() => {
        headerRef.current?.querySelector<HTMLElement>("nav a, a[href]")?.focus();
      });
    };
    window.addEventListener(SHOW_PARFUMS_HEADER_EVENT, show);
    return () => window.removeEventListener(SHOW_PARFUMS_HEADER_EVENT, show);
  }, []);

  const hidden = overHero && !heroGone && pinnedOn !== pathname && !focusInside;

  return (
    <header
      ref={headerRef}
      className={[className, overHero ? overHeroClassName : "", hidden ? hiddenClassName : ""].join(" ")}
      onFocusCapture={() => setFocusInside(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusInside(false);
      }}
    >
      {children}
    </header>
  );
}
