import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsCategoriesRepository } from "@/domains/admin-parfums/categories-repository";
import { NewCategoryForm } from "./new-category-form";
import styles from "../../productos/page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nueva categoría" };

export default async function NewCategoryPage() {
  const result = await getAdminSession();
  if (result.status === "not_configured" || result.status === "unavailable" || result.status === "no_membership") redirect("/admin");
  if (result.status === "signed_out") redirect("/admin/login");
  const membership = result.session.memberships.find((candidate) => candidate.businessUnitCode === "parfums");
  if (!membership) redirect("/admin");
  if (membership.role !== "admin") redirect("/admin/parfums/categorias");

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin");
  const repository = new AdminParfumsCategoriesRepository(supabase, membership.businessUnitId);
  const parents = await repository.listParentOptions();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/parfums/categorias" className={styles.back}>← Categorías</Link>
          <h1>Nueva categoría</h1>
          <p>Crea una categoría de Parfums sin modificar el catálogo público legacy.</p>
        </div>
      </header>
      <main>
        {parents.ok ? <NewCategoryForm parentOptions={parents.data} /> : <p className={styles.notice} role="alert">No se pudo cargar la jerarquía.</p>}
      </main>
    </div>
  );
}
