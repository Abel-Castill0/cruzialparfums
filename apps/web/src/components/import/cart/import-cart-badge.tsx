"use client";

import type { Route } from "next";
import Link from "next/link";
import { useImportCart } from "./use-import-cart";
import styles from "./import-cart-badge.module.css";

export function ImportCartBadge() {
  const { totalQuantity } = useImportCart();

  return (
    <Link
      href={"/import/carrito" as Route}
      className={styles.badge}
      aria-label={`Carrito de Import (${totalQuantity} ${totalQuantity === 1 ? "producto" : "productos"})`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
      {totalQuantity > 0 && (
        <span className={styles.count} aria-hidden="true">
          {totalQuantity}
        </span>
      )}
    </Link>
  );
}
