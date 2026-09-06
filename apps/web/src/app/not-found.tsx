import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <p>404 · Cruzial</p>
      <h1>Esta ruta no existe.</h1>
      <Link href="/">Volver al inicio</Link>
    </main>
  );
}
