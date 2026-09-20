import type { Metadata } from "next";
import { ComplaintForm } from "./complaint-form";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Libro de Reclamaciones Virtual",
  description: "Registra un reclamo o queja sobre Cruzial Parfums o Cruzial Import.",
};

export default function LibroDeReclamacionesPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <p className={styles.eyebrow}>Cruzial</p>
        <h1>Libro de Reclamaciones Virtual</h1>
        <p className={styles.intro}>
          Este es nuestro canal para registrar reclamos y quejas conforme a tus derechos como consumidor en el Perú.
          Completa el formulario y te contactaremos para dar seguimiento a tu caso.
        </p>
        <ComplaintForm />
      </div>
    </main>
  );
}
