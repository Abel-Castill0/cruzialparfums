"use client";

import Link from "next/link";

/** Last-resort boundary: calm, honest, with a way forward. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" tabIndex={-1} className="boundary">
      <p className="boundary-mark">Cruzial</p>
      <h1>Algo salió mal.</h1>
      <p className="boundary-text">No pudimos mostrar esta página. Puedes intentarlo de nuevo o volver al inicio.</p>
      <div className="boundary-actions">
        <button type="button" onClick={reset} className="boundary-retry">Intentar de nuevo</button>
        <Link href="/">Volver al inicio</Link>
      </div>
    </main>
  );
}
