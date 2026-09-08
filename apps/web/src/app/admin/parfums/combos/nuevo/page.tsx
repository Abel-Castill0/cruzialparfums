import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsCombosRepository } from "@/domains/admin-parfums/combos-repository";
import { NewComboForm } from "./new-combo-form";
import styles from "../../productos/page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nuevo combo" };

export default async function NewComboPage() {
  const result = await getAdminSession();
  if (result.status === "not_configured") redirect("/admin");
  if (result.status === "unavailable") redirect("/admin");
  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "no_membership") redirect("/admin");

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "parfums" && candidate.role === "admin",
  );
  // A viewer can browse the list/detail but never reaches the create form —
  // mirrors the create page for products/categories.
  if (!membership) redirect("/admin/parfums/combos");

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className={styles.page}>
        <main>
          <p className={styles.notice}>El backend de administración no está configurado en este entorno.</p>
        </main>
      </div>
    );
  }

  const repository = new AdminParfumsCombosRepository(supabase, membership.businessUnitId);
  const eligibleProducts = await repository.listEligibleProducts();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/parfums/combos" className={styles.back}>← Combos</Link>
          <h1>Nuevo combo</h1>
        </div>
      </header>
      <main>
        {!eligibleProducts.ok ? (
          <p className={styles.notice} role="alert">No se pudieron cargar los productos elegibles. Intenta de nuevo.</p>
        ) : eligibleProducts.data.length === 0 ? (
          <div className={styles.formWrapper}>
            <p className={styles.notice}>
              No hay productos Parfums elegibles todavía: cada producto solo puede tener un combo, y este listado
              excluye los productos archivados y los que ya tienen uno.
            </p>
            <div className={styles.formActions}>
              <Link href="/admin/parfums/productos/nuevo" className={styles.primaryButton}>
                + Crear un producto primero
              </Link>
            </div>
          </div>
        ) : (
          <NewComboForm eligibleProducts={eligibleProducts.data} />
        )}
      </main>
    </div>
  );
}
