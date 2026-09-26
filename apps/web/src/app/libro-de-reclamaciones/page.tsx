import type { Metadata } from "next";
import { ComplaintForm } from "./complaint-form";
import { readBusinessLegalIdentity } from "@/domains/complaints/business-legal-identity";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Libro de Reclamaciones Virtual",
  description: "Registra un reclamo o queja sobre Cruzial Parfums o Cruzial Import.",
};

export default async function LibroDeReclamacionesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const query=await searchParams;
  const unit=query.unidad === "import" ? "import" : "parfums";
  const supabase = createSupabasePublicServerClient();
  const [parfumsLegal, importLegal] = supabase
    ? await Promise.all([
        readBusinessLegalIdentity(supabase, "parfums"),
        readBusinessLegalIdentity(supabase, "import"),
      ])
    : [null, null];
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <p className={styles.eyebrow}>Cruzial</p>
        <h1>Libro de Reclamaciones Virtual</h1>
        <p className={styles.intro}>
          Este es nuestro canal para registrar reclamos y quejas conforme a tus derechos como consumidor en el Perú.
          Completa el formulario y te contactaremos para dar seguimiento a tu caso.
        </p>
        <ComplaintForm initialUnit={unit} legalIdentity={{ parfums: parfumsLegal, import: importLegal }} />
      </div>
    </main>
  );
}
