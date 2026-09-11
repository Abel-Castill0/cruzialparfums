import Link from "next/link";
import styles from "./page.module.css";

export default function ImportProductNotFound() {
  return (
    <main className={styles.page}>
      <section className={styles.notFound}>
        <h1>Producto no disponible</h1>
        <p>Este producto no forma parte del consolidado público vigente.</p>
        <Link href="/import">Volver a Cruzial Import</Link>
      </section>
    </main>
  );
}

