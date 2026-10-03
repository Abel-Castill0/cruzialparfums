import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <p className={styles.mark}>Cruzial</p>
      <h1>Esta página no existe.</h1>
      <p className={styles.text}>El enlace pudo cambiar o escribirse mal. Elige a dónde quieres ir.</p>
      <div className={styles.actions}>
        <Link href="/parfums">Ir a Parfums</Link>
        <Link href="/import">Ir a Import</Link>
      </div>
    </main>
  );
}
