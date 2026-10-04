import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ActionLink,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  BackLink,
  Checklist,
  Disclosure,
  FactList,
  NextStepCard,
  Notice,
  StatusBadge,
} from "@/components/admin/admin-ui";
import { AdminParfumsProductsRepository } from "@/domains/admin-parfums/products-repository";
import { AdminParfumsMediaRepository } from "@/domains/admin-parfums/media-repository";
import {
  PRODUCT_AVAILABILITY_LABELS,
  PRODUCT_STATUS_LABELS,
  isValidUuid,
  type AvailabilityStatus,
  type PublicationStatus,
} from "@/domains/admin-parfums/product-schema";
import { assessParfumsProduct } from "@/domains/admin-parfums/product-presentation";
import { formatLimaDateTime } from "@/domains/admin/order-presentation";
import { ProductCoreForm } from "./product-core-form";
import { VariantManager } from "./variant-manager";
import { CategoryPicker } from "./category-picker";
import { MediaManager } from "./media-manager";
import { readCloudinaryEnv } from "@/lib/media/cloudinary-env";
import styles from "@/components/admin/catalog-workspace.module.css";

export const dynamic = "force-dynamic";

const LIST_HREF = "/admin/parfums/productos";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: isValidUuid(id) ? "Editar producto" : "Producto" };
}

const CHECK_STATE_LABELS = {
  complete: "Completo",
  attention: "Requiere atención",
  not_started: "Sin empezar",
  blocked: "Aún no disponible",
  unknown: "Sin verificar",
} as const;

function ProblemPage({ title }: { title: string }) {
  return (
    <AdminPage>
      <div>
        <BackLink href={LIST_HREF}>Productos</BackLink>
        <AdminPageHeader eyebrow="Cruzial Parfums · Producto" title="Producto" />
      </div>
      <Notice tone="danger" title={title}>Recarga la página. No hagas cambios hasta que el producto cargue completo.</Notice>
    </AdminPage>
  );
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
  if (result.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (result.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "parfums",
  );
  if (!membership) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  if (!supabase) return <ProblemPage title="El backend de administración no está configurado en este entorno." />;

  const repository = new AdminParfumsProductsRepository(supabase, membership.businessUnitId);
  const mediaRepository = new AdminParfumsMediaRepository(supabase);
  const [detailResult, categoriesResult, mediaResult, comboResult] = await Promise.all([
    repository.getById(id),
    repository.listAvailableCategories(),
    mediaRepository.listForProduct(id),
    supabase.from("combos").select("id").eq("product_id", id).maybeSingle(),
  ]);

  if (!detailResult.ok) {
    if (detailResult.error.type === "not_found") notFound();
    return <ProblemPage title="No pudimos cargar el producto." />;
  }

  const { product, variants, categories } = detailResult.data;
  const availableCategories = categoriesResult.ok ? categoriesResult.data : [];
  const media = mediaResult.ok ? mediaResult.data : [];
  const canWrite = membership.role === "admin";
  const isCombo = !comboResult.error && comboResult.data !== null;
  // Media or combo lookups failing means the summary would be incomplete —
  // report it as unverified rather than showing a guessed verdict.
  const summaryVerifiable = mediaResult.ok && !comboResult.error;
  const assessment = !isCombo && summaryVerifiable ? assessParfumsProduct({ product, variants, categories, media }) : null;
  const publication = product.publication_status as PublicationStatus;
  const archived = product.archived_at !== null;
  const next = assessment?.nextCheck ?? null;

  return (
    <AdminPage width="wide">
      <div>
        <BackLink href={LIST_HREF}>Productos</BackLink>
        <AdminPageHeader
          eyebrow="Cruzial Parfums · Producto"
          title={product.name}
          description={product.brand ?? "Sin marca"}
          meta={canWrite ? undefined : "Acceso de solo lectura: puedes ver este producto, pero no guardar cambios."}
          actions={
            <div className={styles.headerBadges}>
              <StatusBadge tone={archived ? "neutral" : publication === "published" ? "healthy" : "attention"}>
                {archived ? "Archivado" : PRODUCT_STATUS_LABELS[publication] ?? "Estado desconocido"}
              </StatusBadge>
              {!archived ? (
                <StatusBadge tone={product.availability_status === "out_of_stock" ? "attention" : "neutral"}>
                  {PRODUCT_AVAILABILITY_LABELS[product.availability_status as AvailabilityStatus] ?? "Disponibilidad desconocida"}
                </StatusBadge>
              ) : null}
              {assessment?.visibleInStore ? (
                <ActionLink href={`/parfums/productos/${product.slug}`} external>Ver en la tienda</ActionLink>
              ) : null}
            </div>
          }
        />
      </div>

      {isCombo ? (
        <Notice tone="neutral" title="Este producto es un combo">
          Su contenido y visibilidad se revisan en Combos. Aquí puedes editar sus datos, presentaciones y fotos.
        </Notice>
      ) : !assessment ? (
        <Notice tone="attention" title="No pudimos verificar qué ven tus clientes">
          Parte de la información del producto no se pudo cargar. Recarga la página antes de decidir.
        </Notice>
      ) : (
        <section className={styles.summary} aria-labelledby="visibility-title">
          <div className={styles.summaryMain}>
            <h2 id="visibility-title" className={styles.eyebrow}>Qué ven tus clientes</h2>
            <p className={styles.headline}>{assessment.headline}</p>
            <p className={styles.consequence}>{assessment.consequence}</p>
          </div>
          <div className={styles.summaryNext}>
            {next ? (
              <NextStepCard title={next.title} tone={next.blocking ? "attention" : "neutral"}>
                <p>{next.detail}</p>
                {!next.blocking ? <p className={styles.muted}>Recomendado: no impide que aparezca en la tienda.</p> : null}
                <ActionLink href={next.anchor} variant="primary">{canWrite ? next.actionLabel : "Ver detalle"}</ActionLink>
              </NextStepCard>
            ) : (
              <NextStepCard title="Nada pendiente" tone="healthy">
                <p>El producto tiene todo lo que la tienda necesita.</p>
              </NextStepCard>
            )}
          </div>
        </section>
      )}

      {assessment ? (
        <AdminSection
          id="preparacion"
          title="Preparación del producto"
          description="Se calcula con los datos guardados. Lo recomendado no impide que el producto aparezca en la tienda."
        >
          <Checklist
            label="Preparación del producto"
            rows={assessment.checks.map((check) => ({
              key: check.key,
              title: check.blocking ? check.title : `${check.title} (recomendado)`,
              state: check.state,
              stateLabel: check.state === "attention" && !check.blocking ? "Recomendado" : CHECK_STATE_LABELS[check.state],
              detail: check.detail,
              href: check.state === "complete" ? null : check.anchor,
              actionLabel: check.state === "complete" ? null : canWrite ? check.actionLabel : "Ver",
            }))}
          />
        </AdminSection>
      ) : null}

      <div id="informacion" className={styles.anchor}>
        <AdminSection
          id="informacion-producto"
          title="Información del producto"
          description="Nombre, descripción, género, publicación y disponibilidad. Se guarda por separado de las demás secciones."
        >
          <ProductCoreForm product={product} disabled={!canWrite} />
        </AdminSection>
      </div>

      <div id="presentaciones" className={styles.anchor}>
        <VariantManager productId={product.id} variants={variants} disabled={!canWrite} />
      </div>

      <div id="fotos" className={styles.anchor}>
        {mediaResult.ok ? (
          <MediaManager
            productId={product.id}
            media={media}
            variants={variants}
            disabled={!canWrite}
            uploadsConfigured={readCloudinaryEnv() !== null}
            productLabel={[product.brand, product.name].filter(Boolean).join(" ")}
          />
        ) : (
          <Notice tone="attention" title="No pudimos cargar las fotos">Recarga la página antes de subir o cambiar fotos.</Notice>
        )}
      </div>

      <div id="categorias" className={styles.anchor}>
        {categoriesResult.ok ? (
          <CategoryPicker
            productId={product.id}
            availableCategories={availableCategories}
            assignedCategoryIds={categories.map((entry) => entry.category_id)}
            disabled={!canWrite}
          />
        ) : (
          <Notice tone="attention" title="No pudimos cargar las categorías">Recarga la página antes de cambiarlas.</Notice>
        )}
      </div>

      <Disclosure summary="Ver detalle técnico" hint="Identificadores y fechas del registro">
        <FactList
          items={[
            { term: "Identificador en la tienda (slug)", value: product.slug },
            { term: "ID interno", value: product.id },
            { term: "Última actualización", value: `${formatLimaDateTime(product.updated_at)} (hora de Lima)` },
            { term: "Creado", value: formatLimaDateTime(product.created_at) },
          ]}
        />
      </Disclosure>
    </AdminPage>
  );
}
