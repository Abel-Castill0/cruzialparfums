"use client";

import { usePathname } from "next/navigation";
import { useEffect, type MouseEvent } from "react";
import styles from "./skip-link.module.css";

// WCAG 2.4.1 Bypass Blocks. Mounted once in the root layout, so it is the first focusable element of every
// storefront page. Pages declare a bare <main>; the id is assigned on activation so no page has to opt in.
// The admin ships its own skip link (to #admin-content), so this one stays out of /admin.
const MAIN_ID = "contenido-principal";

function markMain(): HTMLElement | null {
  const main = document.querySelector<HTMLElement>("main");
  if (!main) return null;
  if (!main.id) main.id = MAIN_ID;
  // A <main> is not focusable by default; -1 makes it a programmatic focus target without adding a tab stop.
  if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
  return main;
}

export function SkipLink() {
  const pathname = usePathname();
  // The target must exist for the link to resolve (and for assistive tech to treat it as a skip link): mark the
  // current page's <main> after every navigation, since layouts persist while pages change.
  useEffect(() => {
    markMain();
  }, [pathname]);
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const main = markMain();
    if (!main) return;
    event.preventDefault();
    main.focus();
    main.scrollIntoView({ block: "start" });
  }

  return (
    <a className={styles.skipLink} href={`#${MAIN_ID}`} onClick={handleClick}>
      Saltar al contenido
    </a>
  );
}
