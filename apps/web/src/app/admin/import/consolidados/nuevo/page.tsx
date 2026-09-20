import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { NewCampaignForm } from "./new-campaign-form";
import styles from "@/app/admin/parfums/productos/page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nuevo consolidado" };

export default async function NewConsolidadoPage() {
  const auth = await requireUnitAdmin("import");
  if (!auth.ok) redirect(auth.reason === "forbidden" ? "/admin/import" : "/admin/login");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/import/consolidados" className={styles.back}>← Consolidado / Campañas</Link>
          <h1>Nuevo consolidado</h1>
          <p>Se crea siempre como borrador. El estado se cambia después, explícitamente.</p>
        </div>
      </header>
      <main>
        <NewCampaignForm />
      </main>
    </div>
  );
}
