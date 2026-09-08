import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsCategoriesRepository } from "@/domains/admin-parfums/categories-repository";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";
import { CategoryEditor } from "./category-editor";
import styles from "../../productos/page.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: isValidUuid(id) ? "Editar categoría" : "Categoría" };
}

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidUuid(id)) notFound();
  const result = await getAdminSession();
  if (result.status === "not_configured" || result.status === "unavailable" || result.status === "no_membership") redirect("/admin");
  if (result.status === "signed_out") redirect("/admin/login");
  const membership = result.session.memberships.find((candidate) => candidate.businessUnitCode === "parfums");
  if (!membership) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin");
  const repository = new AdminParfumsCategoriesRepository(supabase, membership.businessUnitId);
  const [detail, parents] = await Promise.all([
    repository.getById(id),
    repository.listParentOptions(id),
  ]);
  if (!detail.ok) {
    if (detail.error.type === "not_found") notFound();
    return <div className={styles.page}><main><p className={styles.notice} role="alert">No se pudo cargar la categoría.</p></main></div>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/parfums/categorias" className={styles.back}>← Categorías</Link>
          <h1>{detail.data.name}</h1>
          <p>
            {detail.data.parent_name ? `Hija de ${detail.data.parent_name} · ` : "Categoría raíz · "}
            Actualizada {new Date(detail.data.updated_at).toLocaleString("es-PE")}
          </p>
        </div>
      </header>
      <main className={styles.formWrapper}>
        {membership.role !== "admin" ? (
          <p className={styles.notice} role="status">Estás en modo solo lectura para Parfums.</p>
        ) : null}
        {parents.ok ? (
          <CategoryEditor category={detail.data} parentOptions={parents.data} disabled={membership.role !== "admin"} />
        ) : (
          <p className={styles.notice} role="alert">No se pudo cargar la jerarquía.</p>
        )}
      </main>
    </div>
  );
}
