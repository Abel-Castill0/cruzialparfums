import type { Route } from "next";
import Link from "next/link";
import styles from "./not-found.module.css";

export default function ProductNotFound() {
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Cruzial Parfums</p>
      <h1>Fragancia no encontrada</h1>
      <p>Esta fragancia ya no está disponible o el enlace es incorrecto.</p>
      <div>
        <Link href="/parfums/catalogo">Volver al catálogo <span aria-hidden="true">→</span></Link>
        <Link href={"/parfums/finder" as Route}>Encontrar una alternativa</Link>
      </div>
    </main>
  );
}
