"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import styles from "./reveal.module.css";

// One observer for every Reveal on the page: hundreds of catalog cards would
// otherwise each own a separate IntersectionObserver.
const listeners = new WeakMap<Element, () => void>();
let sharedObserver: IntersectionObserver | null = null;

function observe(element: Element, onShow: () => void): () => void {
  sharedObserver ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        listeners.get(entry.target)?.();
        listeners.delete(entry.target);
        sharedObserver?.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  listeners.set(element, onShow);
  sharedObserver.observe(element);
  return () => {
    listeners.delete(element);
    sharedObserver?.unobserve(element);
  };
}

/**
 * One-shot entrance for below-the-fold blocks: fade in while rising 20px
 * (ease-out, 400ms). Content is fully visible without JavaScript and under
 * reduced motion; the hidden starting state only exists where scripting is on
 * (see reveal.module.css).
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string | undefined;
  /** Milliseconds, used to stagger siblings. */
  delay?: number;
  as?: "div" | "li" | "section" | "article" | "figure";
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    return observe(element, () => setShown(true));
  }, []);

  const Component = Tag as ElementType;
  return (
    <Component
      ref={ref}
      className={`${styles.reveal} ${className ?? ""}`}
      data-in={shown ? "" : undefined}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </Component>
  );
}
