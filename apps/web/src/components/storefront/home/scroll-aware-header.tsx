"use client";

import { useEffect, useState, type ReactNode } from "react";

const REVEAL_ZONE_PX = 160;
const MIN_DELTA_PX = 8;

/**
 * Sticky header that steps out of the way while the visitor reads downwards
 * and returns on the first upward gesture, near the top, or whenever focus is
 * inside it. It hides by moving `top`, never with `transform`: a transformed
 * ancestor would become the containing block of the header's fixed search,
 * cart and menu dialogs.
 */
export function ScrollAwareHeader({
  className,
  hiddenClassName,
  children,
}: {
  className: string | undefined;
  hiddenClassName: string | undefined;
  children: ReactNode;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const delta = y - lastY;
      if (Math.abs(delta) < MIN_DELTA_PX) return;
      lastY = y;
      // Dialogs lock body scroll; never hide the header they belong to.
      if (document.body.style.overflow === "hidden") return;
      setHidden(y > REVEAL_ZONE_PX && delta > 0);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header
      className={`${className} ${hidden ? hiddenClassName : ""}`}
      onFocusCapture={() => setHidden(false)}
    >
      {children}
    </header>
  );
}
