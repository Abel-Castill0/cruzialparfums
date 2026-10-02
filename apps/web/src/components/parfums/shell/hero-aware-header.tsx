"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

const HERO_PATHS = new Set(["/parfums", "/parfums/catalogo"]);
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
  const overHero = HERO_PATHS.has(pathname);
  const headerRef = useRef<HTMLElement>(null);
  const [heroObservation, setHeroObservation] = useState({ pathname: "", heroGone: false });
  const heroGone = heroObservation.pathname === pathname ? heroObservation.heroGone : false;
  const [focusObservation, setFocusObservation] = useState({ pathname: "", focusInside: false });
  const focusInside = focusObservation.pathname === pathname && focusObservation.focusInside;

  useEffect(() => {
    if (!overHero) return undefined;
    const hero = document.querySelector("[data-home-hero]");
    if (!hero) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const heroIsVisible = Boolean(entry?.isIntersecting);
        setHeroObservation({ pathname, heroGone: !heroIsVisible });
        if (heroIsVisible && hero instanceof HTMLElement && headerRef.current?.contains(document.activeElement)) {
          hero.setAttribute("tabindex", "-1");
          hero.focus({ preventScroll: true });
        }
      },
      { rootMargin: HEADER_REVEAL_MARGIN, threshold: 0 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [overHero, pathname]);

  const hidden = overHero && !heroGone && !focusInside;

  return (
    <header
      ref={headerRef}
      className={[className, overHero ? overHeroClassName : "", hidden ? hiddenClassName : ""].join(" ")}
      onFocusCapture={() => setFocusObservation({ pathname, focusInside: true })}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusObservation({ pathname, focusInside: false });
      }}
    >
      {children}
    </header>
  );
}
