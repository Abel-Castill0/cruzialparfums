import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="boundary">
      <p className="boundary-mark">Cruzial</p>
      <h1>Esta página no existe.</h1>
      <p className="boundary-text">El enlace pudo cambiar o escribirse mal. Elige a dónde quieres ir.</p>
      <div className="boundary-actions">
        <Link href="/parfums">Ir a Parfums</Link>
        <Link href="/import">Ir a Import</Link>
      </div>
    </main>
  );
}
