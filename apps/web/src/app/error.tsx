"use client";

import Link from "next/link";
import styles from "./not-found.module.css";

/** Last-resort boundary: calm, honest, with a way forward. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className={styles.page}>
      <p className={styles.mark}>Cruzial</p>
      <h1>Algo salió mal.</h1>
      <p className={styles.text}>No pudimos mostrar esta página. Puedes intentarlo de nuevo o volver al inicio.</p>
      <div className={styles.actions}>
        <button type="button" onClick={reset} className={styles.retry}>Intentar de nuevo</button>
        <Link href="/">Volver al inicio</Link>
      </div>
    </main>
  );
}
