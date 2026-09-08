import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsCombosRepository } from "@/domains/admin-parfums/combos-repository";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";
import { ComboWorkspace } from "./combo-workspace";
import styles from "../../productos/page.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: isValidUuid(id) ? "Editar combo" : "Combo" };
}

export default async function EditComboPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidUuid(id)) notFound();

  const result = await getAdminSession();
  if (result.status === "not_configured") redirect("/admin");
  if (result.status === "unavailable") redirect("/admin");
  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "no_membership") redirect("/admin");

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "parfums",
  );
  if (!membership) redirect("/admin");

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
  const detailResult = await repository.getById(id);

  if (!detailResult.ok) {
    if (detailResult.error.type === "not_found") notFound();
    return (
      <div className={styles.page}>
        <main>
          <p className={styles.notice} role="alert">No se pudo cargar el combo.</p>
        </main>
      </div>
    );
  }

  const { combo, product, items } = detailResult.data;
  const canWrite = membership.role === "admin";

  // Eligible additions exclude this combo's own product (the DB rejects a
  // self-reference too — this is the UI never even offering the choice).
  const eligibleVariantsResult = await repository.listEligibleVariants(combo.product_id);
  const eligibleVariants = eligibleVariantsResult.ok ? eligibleVariantsResult.data : [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/parfums/combos" className={styles.back}>← Combos</Link>
          <h1>Combo: {product.name}</h1>
          <p>
            Producto: {product.slug} ({product.publication_status}) · Combo actualizado{" "}
            {new Date(combo.updated_at).toLocaleString("es-PE")}
          </p>
        </div>
      </header>

      <main className={styles.formWrapper}>
        {!canWrite ? (
          <p className={styles.notice} role="status">
            Estás en modo solo lectura para Parfums. Puedes ver este combo pero no guardar cambios.
          </p>
        ) : null}

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <h2>Datos del producto</h2>
            <Link href={`/admin/parfums/productos/${product.id}`} className={styles.secondaryButton}>
              Editar producto →
            </Link>
          </div>
          <p className={styles.notice}>
            Nombre, marca, slug, precio y publicación del combo se administran en el editor del producto — editar el
            combo aquí nunca los cambia automáticamente.
            {product.archived_at ? " Este producto está archivado." : ""}
          </p>
        </section>

        <ComboWorkspace combo={combo} items={items} eligibleVariants={eligibleVariants} disabled={!canWrite} />
      </main>
    </div>
  );
}
