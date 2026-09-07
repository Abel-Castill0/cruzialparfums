import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/parfums/institutional/institutional.module.css";

export const metadata: Metadata = {
  title: "Página no encontrada",
  description: "Esta página no existe. Explora el catálogo de Cruzial Parfums o vuelve al inicio.",
};

export default function ParfumsNotFound() {
  return (
    <main className={styles.notFound}>
      <span className={styles.notFoundCode} aria-hidden="true">404</span>
      <h1>Esta ruta no existe.</h1>
      <p>Puede que la página se haya movido o el enlace sea incorrecto. Volvamos a lo que importa: encontrar tu próxima fragancia.</p>
      <div className={styles.notFoundActions}>
        <Link className={styles.btnPrimary} href="/parfums/catalogo">
          Ver catálogo <span aria-hidden="true">→</span>
        </Link>
        <Link className={styles.btnGhost} href="/parfums">
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}