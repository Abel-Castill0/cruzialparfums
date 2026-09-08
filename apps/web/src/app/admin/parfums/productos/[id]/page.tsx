import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsProductsRepository } from "@/domains/admin-parfums/products-repository";
import { AdminParfumsMediaRepository } from "@/domains/admin-parfums/media-repository";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";
import { ProductCoreForm } from "./product-core-form";
import { VariantManager } from "./variant-manager";
import { CategoryPicker } from "./category-picker";
import { MediaManager } from "./media-manager";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: isValidUuid(id) ? "Editar producto" : "Producto" };
}

export default async function EditProductPage({
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
          <p className={styles.notice}>
            El backend de administración no está configurado en este entorno.
          </p>
        </main>
      </div>
    );
  }

  const repository = new AdminParfumsProductsRepository(supabase, membership.businessUnitId);
  const mediaRepository = new AdminParfumsMediaRepository(supabase);
  const [detailResult, categoriesResult, mediaResult] = await Promise.all([
    repository.getById(id),
    repository.listAvailableCategories(),
    mediaRepository.listForProduct(id),
  ]);

  if (!detailResult.ok) {
    if (detailResult.error.type === "not_found") notFound();
    return (
      <div className={styles.page}>
        <main>
          <p className={styles.notice} role="alert">No se pudo cargar el producto.</p>
        </main>
      </div>
    );
  }

  const { product, variants, categories } = detailResult.data;
  const availableCategories = categoriesResult.ok ? categoriesResult.data : [];
  const media = mediaResult.ok ? mediaResult.data : [];
  const canWrite = membership.role === "admin";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/parfums/productos" className={styles.back}>
            ← Productos
          </Link>
          <h1>{product.name}</h1>
          <p>Slug: {product.slug} · Actualizado {new Date(product.updated_at).toLocaleString("es-PE")}</p>
        </div>
      </header>

      <main className={styles.formWrapper}>
        {!canWrite ? (
          <p className={styles.notice} role="status">
            Estás en modo solo lectura para Parfums. Puedes ver este producto pero no guardar cambios.
          </p>
        ) : null}

        <ProductCoreForm product={product} disabled={!canWrite} />

        <VariantManager
          productId={product.id}
          variants={variants}
          disabled={!canWrite}
        />

        <MediaManager
          productId={product.id}
          media={media}
          variants={variants}
          disabled={!canWrite}
        />

        <CategoryPicker
          productId={product.id}
          availableCategories={availableCategories}
          assignedCategoryIds={categories.map((entry) => entry.category_id)}
          disabled={!canWrite}
        />
      </main>
    </div>
  );
}
